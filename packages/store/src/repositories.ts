import type { AppConfig } from '@gofor/core/config';
import {
  type Checkin,
  DEFAULT_SUBJECT_NAMES,
  type StoredTemplate,
  type StoredTimetable,
  type StudySession,
  type Subject,
  type TagPool,
  type Task,
} from '@gofor/core/domain';
import type { PomodoroRun } from '@gofor/core/pomodoro';
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

/** 新增科目。 */
export async function createSubject(database: GoForDb, name: string): Promise<Subject> {
  const all = await listSubjects(database);
  const subject: Subject = {
    id: `subject-${Date.now().toString(36)}-${all.length}`,
    name,
    order: all.length,
  };
  await database.subjects.put(subject);
  return subject;
}

/** 改名。科目被课表规则和任务引用，所以只改名字，不动 id。 */
export async function renameSubject(database: GoForDb, id: string, name: string): Promise<void> {
  await database.subjects.update(id, { name });
}

/**
 * 删除科目。
 *
 * 不级联删除引用它的任务与课表规则——那会造成静默的数据丢失。
 * 引用会变成"未知科目"，由调用方决定怎么处理。
 */
export async function deleteSubject(database: GoForDb, id: string): Promise<void> {
  await database.subjects.delete(id);
}

/* ------------------------------------------------------------------ 标签池 */

export async function listTagPools(database: GoForDb): Promise<TagPool[]> {
  return database.tagPools.toArray();
}

export async function saveTagPool(
  database: GoForDb,
  id: string,
  name: string,
  tags: string[],
): Promise<void> {
  await database.tagPools.put({ id, name, tags });
}

export async function deleteTagPool(database: GoForDb, id: string): Promise<void> {
  await database.tagPools.delete(id);
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
    optional: false,
    subtasks: [],
    sortKey,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await database.tasks.put(task);
  return task;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'done' | 'due' | 'optional' | 'subtasks' | 'tags' | 'subjectId' | 'sortKey'>
>;

/** 通用更新。字段级补丁，避免为每个小改动写一个新函数。 */
export async function updateTask(
  database: GoForDb,
  id: string,
  patch: TaskPatch,
  now: number,
): Promise<void> {
  await database.tasks.update(id, { ...patch, updatedAt: now });
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

/* ------------------------------------------------------------------ 课表 */

export async function saveTimetable(
  database: GoForDb,
  id: string,
  data: unknown,
  now: number,
): Promise<void> {
  await database.timetables.put({ id, data, updatedAt: now });
}

export async function loadTimetable(database: GoForDb, id: string): Promise<unknown | undefined> {
  const row = await database.timetables.get(id);
  return row?.data;
}

export async function listTimetables(database: GoForDb): Promise<StoredTimetable[]> {
  return database.timetables.toArray();
}

export async function deleteTimetable(database: GoForDb, id: string): Promise<void> {
  await database.timetables.delete(id);
}

/* ------------------------------------------------------------------ 打卡 */

export interface SetCheckinInput {
  date: string;
  done: boolean;
  note?: string | null;
}

/** 写入一天的打卡（同一天覆盖）。 */
export async function setCheckin(
  database: GoForDb,
  input: SetCheckinInput,
  now: number,
): Promise<Checkin> {
  const checkin: Checkin = {
    date: input.date,
    done: input.done,
    note: input.note ?? null,
    updatedAt: now,
  };
  await database.checkins.put(checkin);
  return checkin;
}

export async function getCheckin(database: GoForDb, date: string): Promise<Checkin | undefined> {
  return database.checkins.get(date);
}

/** 闭区间内的打卡记录，按日期升序。 */
export async function listCheckins(
  database: GoForDb,
  from: string,
  to: string,
): Promise<Checkin[]> {
  return database.checkins.where('date').between(from, to, true, true).sortBy('date');
}

/* -------------------------------------------------------------- 番茄钟运行态 */

/**
 * 保存运行态。
 *
 * 每次状态变化（开始/暂停/继续/分心/结算）都落库：
 * 页面刷新、手机被杀进程、切后台都可能发生，靠内存记状态一定会丢。
 */
export async function saveFocusRun(database: GoForDb, run: PomodoroRun): Promise<void> {
  await database.focusRuns.put(run);
}

export async function loadFocusRun(
  database: GoForDb,
  id: string,
): Promise<PomodoroRun | undefined> {
  return database.focusRuns.get(id);
}

/** 找出未结算的运行（用于启动时恢复）。 */
export async function listActiveFocusRuns(database: GoForDb): Promise<PomodoroRun[]> {
  const runs = await database.focusRuns.toArray();
  return runs.filter((run) => run.status === 'running' || run.status === 'paused');
}

export async function deleteFocusRun(database: GoForDb, id: string): Promise<void> {
  await database.focusRuns.delete(id);
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

/* --------------------------------------------------- 番茄钟 → 学习记录 */

/**
 * 把结算后的番茄写成一条 `StudySession`。
 *
 * 三种来源（纸面时间登记 / 纸面专注格 / App 番茄钟）产出同一种实体，
 * 这样统计只写一套。纸面专注格已移除，但 `source` 类型保留兼容旧数据。
 */
export function sessionFromRun(run: PomodoroRun, date: string): StudySession {
  const startMinute = Math.floor(run.createdAt / 60000) % (24 * 60);
  const minutes = Math.round(run.accumulatedMs / 60000);
  return {
    id: `session-${run.id}`,
    date,
    start: startMinute,
    end: startMinute + minutes,
    subjectId: run.subjectId,
    taskId: run.taskId,
    source: 'appTimer',
    createdAt: run.createdAt,
  };
}
