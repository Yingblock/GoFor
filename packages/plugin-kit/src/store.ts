import type {
  Checklist,
  ChecklistLog,
  CourseNote,
  HabitLog,
  DiaryEntry,
  MoodLog,
  ScanBatch,
  SheetManifestRecord,
  StoredTemplate,
  StudySession,
  Subject,
  TagPool,
  Task,
  ToolboxRun,
} from '@gofor/core/domain';
import type { Habit } from '@gofor/domain/habits';
import type { PomodoroRun } from '@gofor/domain/pomodoro';
import type { PluginStoreLike } from '@gofor/plugin-api';

export interface CreateTaskInput {
  id: string;
  title: string;
  subjectId?: string | null;
  due?: string | null;
  now: number;
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'done' | 'due' | 'optional' | 'subtasks' | 'tags' | 'subjectId' | 'sortKey'>
>;

export interface ScanApplySummary {
  tasksDone: number;
  habitsChecked: number;
  moodSaved: boolean;
  skipped: number;
}

/** 构建期插件唯一的数据入口；由宿主按 pluginId 授权。 */
export interface PluginStoreApi {
  listTasks(): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch, now: number): Promise<void>;
  setTaskDone(id: string, done: boolean, now: number): Promise<void>;
  deleteTask(id: string): Promise<void>;
  listTagPools(): Promise<TagPool[]>;
  saveTagPool(id: string, name: string, tags: string[]): Promise<void>;
  deleteTagPool(id: string): Promise<void>;
  ensureSubjects(): Promise<Subject[]>;
  listSubjects(): Promise<Subject[]>;
  createSubject(name: string): Promise<Subject>;
  renameSubject(id: string, name: string): Promise<void>;
  deleteSubject(id: string): Promise<void>;

  listHabits(): Promise<Habit[]>;
  saveHabit(habit: Habit): Promise<void>;
  deleteHabit(id: string): Promise<void>;
  listHabitLogs(from: string, to: string): Promise<HabitLog[]>;
  setHabitLog(id: string, date: string, done: boolean, now: number): Promise<void>;
  applyTaskScan(results: unknown, date: string, now: number): Promise<ScanApplySummary>;
  applyHabitScan(results: unknown, date: string, now: number): Promise<ScanApplySummary>;

  loadTimetable(id: string): Promise<unknown>;
  saveTimetable(id: string, data: unknown, now: number): Promise<void>;
  listCourseNotes(date: string): Promise<CourseNote[]>;
  saveCourseNote(note: Omit<CourseNote, 'id' | 'updatedAt'>, now: number): Promise<void>;

  saveFocusRun(run: PomodoroRun): Promise<void>;
  deleteFocusRun(id: string): Promise<void>;
  listActiveFocusRuns(): Promise<PomodoroRun[]>;
  addSession(session: StudySession): Promise<void>;
  sessionFromRun(run: PomodoroRun, date: string): StudySession;
  currentConfig(): Promise<{ config: unknown }>;
  sessionsRange(from: string, to: string): Promise<StudySession[]>;

  getMoodLog(date: string): Promise<MoodLog | undefined>;
  listMoodLogs(from: string, to: string): Promise<MoodLog[]>;
  saveMoodLog(log: { date: string; sleep: number; mood: number; focus: number }, now: number): Promise<MoodLog>;
  applyMoodScan(results: unknown, date: string, now: number): Promise<ScanApplySummary>;

  listDiary(from: string, to: string): Promise<DiaryEntry[]>;
  saveDiaryEntry(entry: DiaryEntry): Promise<void>;
  deleteDiaryEntry(id: string): Promise<void>;

  listChecklists(): Promise<Checklist[]>;
  saveChecklist(checklist: Checklist): Promise<void>;
  deleteChecklist(id: string): Promise<void>;
  getChecklistLog(id: string, date: string): Promise<ChecklistLog | undefined>;
  listChecklistLogs(from: string, to: string): Promise<ChecklistLog[]>;
  setChecklistLog(id: string, date: string, done: string[], now: number): Promise<void>;

  addToolboxRun(run: ToolboxRun): Promise<void>;

  listScanBatches(limit: number): Promise<ScanBatch[]>;
  saveScanBatch(batch: ScanBatch): Promise<void>;
  updateScanBatchStatus(id: string, status: ScanBatch['status'], now: number): Promise<void>;
  getSheetManifest(templateId: string, date: string, paper: string): Promise<SheetManifestRecord | undefined>;
  listSheetManifestsByDate(date: string): Promise<SheetManifestRecord[]>;
  saveSheetManifest(record: SheetManifestRecord): Promise<void>;
  sheetManifestId(templateId: string, date: string, paper: string): string;
  listTemplates(): Promise<StoredTemplate[]>;
}

const cache = new WeakMap<PluginStoreLike, PluginStoreApi>();

const API_METHODS = (store: PluginStoreLike): PluginStoreApi => ({
    listTasks: () => store.call('tasks.list'),
    createTask: (input) => store.call('tasks.create', input),
    updateTask: (id, patch, now) => store.call('tasks.update', id, patch, now),
    setTaskDone: (id, done, now) => store.call('tasks.setDone', id, done, now),
    deleteTask: (id) => store.call('tasks.delete', id),
    listTagPools: () => store.call('tasks.tags.list'),
    saveTagPool: (id, name, tags) => store.call('tasks.tags.save', id, name, tags),
    deleteTagPool: (id) => store.call('tasks.tags.delete', id),
    ensureSubjects: () => store.call('tasks.ensureSubjects'),
    applyTaskScan: (results, date, now) => store.call('tasks.applyScan', results, date, now),
    listSubjects: () => store.call('subjects.list'),
    createSubject: (name) => store.call('subjects.create', name),
    renameSubject: (id, name) => store.call('subjects.rename', id, name),
    deleteSubject: (id) => store.call('subjects.delete', id),

    listHabits: () => store.call('habits.list'),
    saveHabit: (habit) => store.call('habits.save', habit),
    deleteHabit: (id) => store.call('habits.delete', id),
    listHabitLogs: (from, to) => store.call('habitLogs.list', from, to),
    setHabitLog: (id, date, done, now) => store.call('habitLogs.set', id, date, done, now),
    applyHabitScan: (results, date, now) => store.call('checkin.applyScan', results, date, now),

    loadTimetable: (id) => store.call('timetable.load', id),
    saveTimetable: (id, data, now) => store.call('timetable.save', id, data, now),
    listCourseNotes: (date) => store.call('courseNotes.list', date),
    saveCourseNote: (note, now) => store.call('courseNotes.save', note, now),

    saveFocusRun: (run) => store.call('pomodoro.focus.save', run),
    deleteFocusRun: (id) => store.call('pomodoro.focus.delete', id),
    listActiveFocusRuns: () => store.call('pomodoro.focus.active'),
    addSession: (session) => store.call('pomodoro.session.add', session),
    sessionFromRun: (run, date) => ({
      id: `session-${run.id}`,
      date,
      start: Math.floor(run.createdAt / 60000) % (24 * 60),
      end: (Math.floor(run.createdAt / 60000) % (24 * 60)) + Math.round(run.accumulatedMs / 60000),
      subjectId: run.subjectId,
      taskId: run.taskId,
      source: 'appTimer',
      interruptions: run.interruptions,
      createdAt: run.createdAt,
    }),
    currentConfig: () => store.call('config.current'),
    sessionsRange: (from, to) => store.call('sessions.range', from, to),

    getMoodLog: (date) => store.call('mood.get', date),
    listMoodLogs: (from, to) => store.call('mood.list', from, to),
    saveMoodLog: (log, now) => store.call('mood.save', log, now),
    applyMoodScan: (results, date, now) => store.call('mood.applyScan', results, date, now),

    listDiary: (from, to) => store.call('diary.list', from, to),
    saveDiaryEntry: (entry) => store.call('diary.save', entry),
    deleteDiaryEntry: (id) => store.call('diary.delete', id),

    listChecklists: () => store.call('checklists.list'),
    saveChecklist: (checklist) => store.call('checklists.save', checklist),
    deleteChecklist: (id) => store.call('checklists.delete', id),
    getChecklistLog: (id, date) => store.call('checklistLogs.get', id, date),
    listChecklistLogs: (from, to) => store.call('checklistLogs.list', from, to),
    setChecklistLog: (id, date, done, now) =>
      store.call('checklistLogs.set', id, date, done, now),

    addToolboxRun: (run) => store.call('toolbox.add', run),

    listScanBatches: (limit) => store.call('scan.batches.list', limit),
    saveScanBatch: (batch) => store.call('scan.batches.save', batch),
    updateScanBatchStatus: (id, status, now) =>
      store.call('scan.batches.status', id, status, now),
    getSheetManifest: (templateId, date, paper) =>
      store.call('scan.manifest.get', templateId, date, paper),
    saveSheetManifest: (record) => store.call('scan.manifest.save', record),
    listSheetManifestsByDate: (date) => store.call('scan.manifestsByDate', date),
    sheetManifestId: (templateId, date, paper) => `${templateId}@${date}@${paper}`,
    listTemplates: () => store.call('templates.list'),
  });

export function pluginStore(store: PluginStoreLike): PluginStoreApi {
  const existing = cache.get(store);
  if (existing) return existing;
  const api = API_METHODS(store);
  cache.set(store, api);
  return api;
}
