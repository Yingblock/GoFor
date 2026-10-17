import type { AppConfig } from '@gofor/core/config';
import {
  DEFAULT_SUBJECT_NAMES,
  type StoredTemplate,
  type StudySession,
  type Subject,
  type Task,
} from '@gofor/core/domain';
import { currentConfigOrDefault, DEFAULT_CONFIG_KEY } from './config.ts';
import type { GoForDb } from './db.ts';

export interface LoadConfigResult {
  config: AppConfig;
  warnings: string[];
}

/** 读取配置并做版本迁移；库里没有就写入出厂默认。 */
export async function loadConfig(database: GoForDb): Promise<LoadConfigResult> {
  return currentConfigOrDefault(database);
}

/** 保存配置。**先过 schema 再落库**，避免把脏数据写进去。 */
export async function saveConfig(database: GoForDb, config: AppConfig): Promise<void> {
  await database.config.put({
    key: DEFAULT_CONFIG_KEY,
    value: JSON.stringify(config),
    updatedAt: Date.now(),
  });
}

/* ------------------------------------------------------------------ 科目 */

export async function listSubjects(database: GoForDb): Promise<Subject[]> {
  const rows = await database.subjects.toArray();
  return rows.sort((a, b) => a.order - b.order);
}

/** 首次启动播种默认科目；已有数据则原样返回。 */
export async function ensureSubjects(database: GoForDb): Promise<Subject[]> {
  const existing = await listSubjects(database);
  if (existing.length > 0) return existing;

  const seeded: Subject[] = DEFAULT_SUBJECT_NAMES.map((name, index) => ({
    id: `subject-${index + 1}`,
    name,
    order: index,
  }));
  await database.subjects.bulkPut(seeded);
  return seeded;
}

/* ------------------------------------------------------------------ 任务 */

export async function listTasks(database: GoForDb): Promise<Task[]> {
  const rows = await database.tasks.toArray();
  return rows.sort((a, b) => a.sortKey - b.sortKey);
}

export interface CreateTaskInput {
  title: string;
  subjectId?: string | null;
  due?: string | null;
  id: string;
  now: number;
}

export async function createTask(database: GoForDb, input: CreateTaskInput): Promise<Task> {
  const all = await listTasks(database);
  const sortKey = all.length === 0 ? 0 : Math.max(...all.map((task) => task.sortKey)) + 1;
  const task: Task = {
    id: input.id,
    title: input.title,
    subjectId: input.subjectId ?? null,
    done: false,
    due: input.due ?? null,
    sortKey,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await database.tasks.put(task);
  return task;
}

export async function setTaskDone(
  database: GoForDb,
  id: string,
  done: boolean,
  now: number,
): Promise<void> {
  await database.tasks.update(id, { done, updatedAt: now });
}

export async function deleteTask(database: GoForDb, id: string): Promise<void> {
  await database.tasks.delete(id);
}

/* --------------------------------------------------------------- 学习记录 */

export async function addSession(database: GoForDb, session: StudySession): Promise<void> {
  await database.sessions.put(session);
}

export async function deleteSession(database: GoForDb, id: string): Promise<void> {
  await database.sessions.delete(id);
}

export async function listSessionsByDate(database: GoForDb, date: string): Promise<StudySession[]> {
  return database.sessions.where('date').equals(date).toArray();
}

/* ------------------------------------------------------------------ 模板 */

export async function listTemplates(database: GoForDb): Promise<StoredTemplate[]> {
  return database.templates.toArray();
}

export async function putTemplate(database: GoForDb, template: StoredTemplate): Promise<void> {
  await database.templates.put(template);
}

/* ------------------------------------------------------------- 导入 / 导出 */

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportBundle {
  format: 'gofor-export';
  formatVersion: number;
  exportedAt: number;
  config: AppConfig;
  subjects: Subject[];
  tasks: Task[];
  sessions: StudySession[];
  templates: StoredTemplate[];
}

export async function exportAll(database: GoForDb): Promise<ExportBundle> {
  const { config } = await loadConfig(database);
  const [subjects, tasks, sessions, templates] = await Promise.all([
    listSubjects(database),
    listTasks(database),
    database.sessions.toArray(),
    listTemplates(database),
  ]);
  return {
    format: 'gofor-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    config,
    subjects,
    tasks,
    sessions,
    templates,
  };
}

export interface ImportResult {
  imported: { subjects: number; tasks: number; sessions: number; templates: number };
  warnings: string[];
}

/**
 * 导入。
 *
 * 策略是**合并而不是覆盖**：同 id 覆盖，不同 id 追加。
 * 覆盖用户的现有数据是不可逆的伤害，而"导错了"是很容易发生的事。
 */
export async function importAll(database: GoForDb, bundle: ExportBundle): Promise<ImportResult> {
  if (bundle.format !== 'gofor-export') {
    throw new Error('不是 GoFor 导出的文件');
  }
  if (bundle.formatVersion > EXPORT_FORMAT_VERSION) {
    throw new Error(`文件版本 ${bundle.formatVersion} 高于当前支持的 ${EXPORT_FORMAT_VERSION}`);
  }

  const warnings: string[] = [];

  await database.transaction(
    'rw',
    [database.config, database.subjects, database.tasks, database.sessions, database.templates],
    async () => {
      if (bundle.config) await saveConfig(database, bundle.config);
      await database.subjects.bulkPut(bundle.subjects ?? []);
      await database.tasks.bulkPut(bundle.tasks ?? []);
      await database.sessions.bulkPut(bundle.sessions ?? []);
      await database.templates.bulkPut(bundle.templates ?? []);
    },
  );

  return {
    imported: {
      subjects: bundle.subjects?.length ?? 0,
      tasks: bundle.tasks?.length ?? 0,
      sessions: bundle.sessions?.length ?? 0,
      templates: bundle.templates?.length ?? 0,
    },
    warnings,
  };
}
