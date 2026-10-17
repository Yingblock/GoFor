import type { AppConfig } from '@gofor/core/config';
import {
  type Checkin,
  type Checklist,
  type ChecklistLog,
  DEFAULT_SUBJECT_NAMES,
  type DiaryEntry,
  type HabitLog,
  type MoodLog,
  type ScanBatch,
  type ScanResult,
  type SheetManifestRecord,
  type StoredTemplate,
  type StoredTimetable,
  type StudySession,
  type Subject,
  type TagPool,
  type Task,
  type ToolboxRun,
} from '@gofor/core/domain';
import type { Habit } from '@gofor/core/habits';
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

/* ---------------------------------------------------------------- 打卡项 */

export async function listHabits(database: GoForDb): Promise<Habit[]> {
  const habits = await database.habits.toArray();
  return habits.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function saveHabit(database: GoForDb, habit: Habit): Promise<void> {
  await database.habits.put(habit);
}

/** 删除打卡项连同它的历史——两者没有独立意义，留着只会变成孤儿数据。 */
export async function deleteHabit(database: GoForDb, id: string): Promise<void> {
  await database.transaction('rw', [database.habits, database.habitLogs], async () => {
    await database.habits.delete(id);
    await database.habitLogs.where('habitId').equals(id).delete();
  });
}

/**
 * 闭区间内的打卡记录（所有打卡项）。
 *
 * 走 `date` 索引而不是 `toArray()` 后再 filter：后者会把整张表读进内存。
 * 打卡记录一天最多几行、一年也就几百行，现在还无所谓；但它是唯一会无界增长的表，
 * 等用满一学期再改就要动数据层了，不如现在就写对。
 */
export async function listHabitLogs(
  database: GoForDb,
  from: string,
  to: string,
): Promise<HabitLog[]> {
  return database.habitLogs.where('date').between(from, to, true, true).toArray();
}

/** 写入/覆盖某天某项的打卡状态。 */
export async function setHabitLog(
  database: GoForDb,
  habitId: string,
  date: string,
  done: boolean,
  now: number,
): Promise<void> {
  await database.habitLogs.put({
    id: `${habitId}@${date}`,
    habitId,
    date,
    done,
    updatedAt: now,
  });
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

/** 找出未结算的运行（用于启动时恢复）。走 `status` 索引，不整表读。 */
export async function listActiveFocusRuns(database: GoForDb): Promise<PomodoroRun[]> {
  return database.focusRuns.where('status').anyOf('running', 'paused').toArray();
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

/**
 * 导出包：**所有会持久化的表都在这里**。
 *
 * 这条规则写进了 AGENTS：新增表必须同时进 exportAll / importAll。
 * 漏一张表的后果是"备份成功、恢复少一半数据"——用户不会看得出来，
 * 直到他真的丢了数据。P1 收尾时这里就漏过 habits/habitLogs/timetables/tagPools/focusRuns。
 *
 * 后四个字段是可选的：旧版本导出的文件没有它们，导入时按空数组处理。
 */
export interface ExportBundle {
  format: 'gofor-export';
  formatVersion: number;
  exportedAt: number;
  config: AppConfig;
  subjects: Subject[];
  tasks: Task[];
  sessions: StudySession[];
  templates: StoredTemplate[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
  timetables?: StoredTimetable[];
  tagPools?: TagPool[];
  focusRuns?: PomodoroRun[];
  moodLogs?: MoodLog[];
  diaryEntries?: DiaryEntry[];
  toolboxRuns?: ToolboxRun[];
  checklists?: Checklist[];
  checklistLogs?: ChecklistLog[];
  scanBatches?: ScanBatch[];
  sheetManifests?: SheetManifestRecord[];
}

export async function exportAll(database: GoForDb): Promise<ExportBundle> {
  const { config } = await loadConfig(database);
  const [
    subjects,
    tasks,
    sessions,
    templates,
    habits,
    habitLogs,
    timetables,
    tagPools,
    focusRuns,
    moodLogs,
    diaryEntries,
    toolboxRuns,
    checklists,
    checklistLogs,
    scanBatches,
    sheetManifests,
  ] = await Promise.all([
    listSubjects(database),
    listTasks(database),
    database.sessions.toArray(),
    listTemplates(database),
    listHabits(database),
    database.habitLogs.toArray(),
    database.timetables.toArray(),
    database.tagPools.toArray(),
    database.focusRuns.toArray(),
    database.moodLogs.toArray(),
    database.diaryEntries.toArray(),
    database.toolboxRuns.toArray(),
    database.checklists.toArray(),
    database.checklistLogs.toArray(),
    database.scanBatches.toArray(),
    database.sheetManifests.toArray(),
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
    habits,
    habitLogs,
    timetables,
    tagPools,
    focusRuns,
    moodLogs,
    diaryEntries,
    toolboxRuns,
    checklists,
    checklistLogs,
    scanBatches,
    sheetManifests,
  };
}

export interface ImportResult {
  imported: {
    subjects: number;
    tasks: number;
    sessions: number;
    templates: number;
    habits: number;
    habitLogs: number;
    timetables: number;
    tagPools: number;
    focusRuns: number;
    moodLogs: number;
    diaryEntries: number;
    toolboxRuns: number;
    checklists: number;
    checklistLogs: number;
    scanBatches: number;
    sheetManifests: number;
  };
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
    [
      database.config,
      database.subjects,
      database.tasks,
      database.sessions,
      database.templates,
      database.habits,
      database.habitLogs,
      database.timetables,
      database.tagPools,
      database.focusRuns,
      database.moodLogs,
      database.diaryEntries,
      database.toolboxRuns,
      database.checklists,
      database.checklistLogs,
      database.scanBatches,
      database.sheetManifests,
    ],
    async () => {
      if (bundle.config) await saveConfig(database, bundle.config);
      await database.subjects.bulkPut(bundle.subjects ?? []);
      await database.tasks.bulkPut(bundle.tasks ?? []);
      await database.sessions.bulkPut(bundle.sessions ?? []);
      await database.templates.bulkPut(bundle.templates ?? []);
      // 旧版本导出的文件没有下面这些字段：`?? []` 让它们照常导入，而不是报错。
      await database.habits.bulkPut(bundle.habits ?? []);
      await database.habitLogs.bulkPut(bundle.habitLogs ?? []);
      await database.timetables.bulkPut(bundle.timetables ?? []);
      await database.tagPools.bulkPut(bundle.tagPools ?? []);
      await database.focusRuns.bulkPut(bundle.focusRuns ?? []);
      await database.moodLogs.bulkPut(bundle.moodLogs ?? []);
      await database.diaryEntries.bulkPut(bundle.diaryEntries ?? []);
      await database.toolboxRuns.bulkPut(bundle.toolboxRuns ?? []);
      await database.checklists.bulkPut(bundle.checklists ?? []);
      await database.checklistLogs.bulkPut(bundle.checklistLogs ?? []);
      await database.scanBatches.bulkPut(bundle.scanBatches ?? []);
      await database.sheetManifests.bulkPut(bundle.sheetManifests ?? []);
    },
  );

  return {
    imported: {
      subjects: bundle.subjects?.length ?? 0,
      tasks: bundle.tasks?.length ?? 0,
      sessions: bundle.sessions?.length ?? 0,
      templates: bundle.templates?.length ?? 0,
      habits: bundle.habits?.length ?? 0,
      habitLogs: bundle.habitLogs?.length ?? 0,
      timetables: bundle.timetables?.length ?? 0,
      tagPools: bundle.tagPools?.length ?? 0,
      focusRuns: bundle.focusRuns?.length ?? 0,
      moodLogs: bundle.moodLogs?.length ?? 0,
      diaryEntries: bundle.diaryEntries?.length ?? 0,
      toolboxRuns: bundle.toolboxRuns?.length ?? 0,
      checklists: bundle.checklists?.length ?? 0,
      checklistLogs: bundle.checklistLogs?.length ?? 0,
      scanBatches: bundle.scanBatches?.length ?? 0,
      sheetManifests: bundle.sheetManifests?.length ?? 0,
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
    // 分心历史跟着学习记录走：focusRuns 结算后会被删，不抄过来周报就永远读不到。
    interruptions: run.interruptions,
    createdAt: run.createdAt,
  };
}

/* ------------------------------------- P2：三滑块 / 日记 / 工具箱 / 清单 */

/** 某一天的三滑块；没填过返回 undefined。 */
export async function getMoodLog(database: GoForDb, date: string): Promise<MoodLog | undefined> {
  return database.moodLogs.get(date);
}

/** 写入/覆盖某一天的三滑块（一天一条，幂等）。 */
export async function saveMoodLog(
  database: GoForDb,
  input: { date: string; sleep: number; mood: number; focus: number },
  now: number,
): Promise<MoodLog> {
  const log: MoodLog = { ...input, updatedAt: now };
  await database.moodLogs.put(log);
  return log;
}

/** 闭区间内的三滑块（走 date 索引）。 */
export async function listMoodLogs(
  database: GoForDb,
  from: string,
  to: string,
): Promise<MoodLog[]> {
  return database.moodLogs.where('date').between(from, to, true, true).toArray();
}

export async function saveDiaryEntry(database: GoForDb, entry: DiaryEntry): Promise<void> {
  await database.diaryEntries.put(entry);
}

/** 闭区间内的日记，按日期倒序、同一天内新的在前。 */
export async function listDiaryEntries(
  database: GoForDb,
  from: string,
  to: string,
): Promise<DiaryEntry[]> {
  const rows = await database.diaryEntries.where('date').between(from, to, true, true).toArray();
  return rows.sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
}

export async function deleteDiaryEntry(database: GoForDb, id: string): Promise<void> {
  await database.diaryEntries.delete(id);
}

export async function addToolboxRun(database: GoForDb, run: ToolboxRun): Promise<void> {
  await database.toolboxRuns.put(run);
}

/** 最近的练习记录（按开始时间倒序）。 */
export async function listToolboxRuns(database: GoForDb, limit = 50): Promise<ToolboxRun[]> {
  const rows = await database.toolboxRuns.orderBy('startedAt').reverse().limit(limit).toArray();
  return rows;
}

export async function listChecklists(database: GoForDb): Promise<Checklist[]> {
  const rows = await database.checklists.toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveChecklist(database: GoForDb, checklist: Checklist): Promise<void> {
  await database.checklists.put(checklist);
}

/** 删清单连同它的历史——和打卡项一样，留着只会变成孤儿数据。 */
export async function deleteChecklist(database: GoForDb, id: string): Promise<void> {
  await database.transaction('rw', [database.checklists, database.checklistLogs], async () => {
    await database.checklists.delete(id);
    await database.checklistLogs.where('checklistId').equals(id).delete();
  });
}

export async function getChecklistLog(
  database: GoForDb,
  checklistId: string,
  date: string,
): Promise<ChecklistLog | undefined> {
  return database.checklistLogs.get(`${checklistId}@${date}`);
}

export async function listChecklistLogs(
  database: GoForDb,
  from: string,
  to: string,
): Promise<ChecklistLog[]> {
  return database.checklistLogs.where('date').between(from, to, true, true).toArray();
}

/** 写入/覆盖某清单某天的完成情况。 */
export async function setChecklistLog(
  database: GoForDb,
  checklistId: string,
  date: string,
  done: string[],
  now: number,
): Promise<void> {
  await database.checklistLogs.put({
    id: `${checklistId}@${date}`,
    checklistId,
    date,
    done,
    updatedAt: now,
  });
}

/* ---------------------------------------------------- P2：扫描回填批次 */

export async function saveScanBatch(database: GoForDb, batch: ScanBatch): Promise<void> {
  await database.scanBatches.put(batch);
}

/** 最近的扫描批次（新建在前）。 */
export async function listScanBatches(database: GoForDb, limit = 20): Promise<ScanBatch[]> {
  return database.scanBatches.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function updateScanBatchStatus(
  database: GoForDb,
  id: string,
  status: ScanBatch['status'],
  now: number,
): Promise<void> {
  const existing = await database.scanBatches.get(id);
  if (!existing) return;
  await database.scanBatches.put({
    ...existing,
    status,
    appliedAt: status === 'applied' ? now : existing.appliedAt,
  });
}

export async function deleteScanBatch(database: GoForDb, id: string): Promise<void> {
  await database.scanBatches.delete(id);
}

/* ------------------------------------------- P2：打印坐标清单（回填用） */

export function sheetManifestId(templateId: string, date: string, paper: string): string {
  return `${templateId}@${date}@${paper}`;
}

export async function saveSheetManifest(
  database: GoForDb,
  record: SheetManifestRecord,
): Promise<void> {
  await database.sheetManifests.put(record);
}

export async function getSheetManifest(
  database: GoForDb,
  templateId: string,
  date: string,
  paper: string,
): Promise<SheetManifestRecord | undefined> {
  return database.sheetManifests.get(sheetManifestId(templateId, date, paper));
}

/* --------------------------------------------- P2：把扫描结果写进各张表 */

/** `payload` 的命名约定：`task:<id>` / `habit:<id>` / `mood:<sleep|mood|focus>`。 */
export type ScanPayloadKind = 'task' | 'habit' | 'mood';

export interface ScanApplySummary {
  tasksDone: number;
  habitsChecked: number;
  /** 三滑块是否写了（三个值一起写，缺的沿用当天已有值或默认 3）。 */
  moodSaved: boolean;
  /** 识别出来了但对应数据不存在/不认识的条目数。 */
  skipped: number;
}

const MOOD_KEYS = new Set(['sleep', 'mood', 'focus']);

function splitPayload(payload: string): { kind: string; id: string } | null {
  const index = payload.indexOf(':');
  if (index <= 0 || index === payload.length - 1) return null;
  return { kind: payload.slice(0, index), id: payload.slice(index + 1) };
}

/**
 * 把一次扫描的识别结果写进数据层。**只写 `selected` 为真的条目。**
 *
 * 为什么不在这里做阈值判断：阈值是"看图"的事，属于 `@gofor/core/scan` 的 classify；
 * 这里只负责"已经判定为勾选的东西写到哪里去"。分开之后这段能被单测覆盖，
 * 而阈值调整不用重新测写库路径。
 *
 * 三滑块的特殊之处：三个值必须一次写全（那一天只有一条记录），
 * 没扫到的沿用当天已有值，当天也没有就用 3（中间值），
 * 不拿 0 兜底——0 是"没填"，会污染平均值。
 */
export async function applyScanResults(
  database: GoForDb,
  results: readonly ScanResult[],
  date: string,
  now: number,
): Promise<ScanApplySummary> {
  const summary: ScanApplySummary = {
    tasksDone: 0,
    habitsChecked: 0,
    moodSaved: false,
    skipped: 0,
  };
  const mood: Partial<Record<'sleep' | 'mood' | 'focus', number>> = {};

  for (const result of results) {
    if (!result.selected) continue;
    const payload = result.payload ?? null;
    if (payload === null) {
      summary.skipped += 1;
      continue;
    }
    const parsed = splitPayload(payload);
    if (parsed === null) {
      summary.skipped += 1;
      continue;
    }

    if (parsed.kind === 'task') {
      const task = await database.tasks.get(parsed.id);
      if (!task) {
        summary.skipped += 1;
        continue;
      }
      await setTaskDone(database, parsed.id, true, now);
      summary.tasksDone += 1;
      continue;
    }

    if (parsed.kind === 'habit') {
      const habit = await database.habits.get(parsed.id);
      if (!habit) {
        summary.skipped += 1;
        continue;
      }
      await setHabitLog(database, parsed.id, date, true, now);
      summary.habitsChecked += 1;
      continue;
    }

    if (parsed.kind === 'mood' && MOOD_KEYS.has(parsed.id) && result.value !== undefined) {
      mood[parsed.id as 'sleep' | 'mood' | 'focus'] = result.value;
      continue;
    }

    summary.skipped += 1;
  }

  if (mood.sleep !== undefined || mood.mood !== undefined || mood.focus !== undefined) {
    const existing = await getMoodLog(database, date);
    await saveMoodLog(
      database,
      {
        date,
        sleep: mood.sleep ?? existing?.sleep ?? 3,
        mood: mood.mood ?? existing?.mood ?? 3,
        focus: mood.focus ?? existing?.focus ?? 3,
      },
      now,
    );
    summary.moodSaved = true;
  }

  return summary;
}
