import type { PluginStoreLike } from '@gofor/plugin-api';
import * as repo from '@gofor/store';
import { db } from '@gofor/store';

/**
 * 构建期插件的数据能力边界。
 *
 * 插件不再直接 import `@gofor/store`；宿主按 pluginId 只暴露它拥有的能力。
 * 越权调用（例如作业插件读打卡表）在运行期直接抛错，不依赖“插件自觉”。
 */
const ACCESS: Readonly<Record<string, readonly string[]>> = {
  'gofor.tasks': ['tasks.*', 'subjects.list'],
  'gofor.checkin': ['habits.*', 'habitLogs.*', 'checkin.applyScan'],
  'gofor.timetable': ['timetable.*', 'subjects.*', 'courseNotes.*'],
  'gofor.pomodoro': [
    'pomodoro.*',
    'sessions.*',
    'subjects.*',
    'config.current',
    'tasks.ensureSubjects',
  ],
  'gofor.mood': ['mood.*', 'mood.applyScan'],
  'gofor.diary': ['diary.*'],
  'gofor.checklist': ['checklists.*', 'checklistLogs.*'],
  'gofor.toolbox': ['toolbox.*'],
  'gofor.wordbook': [],
  'gofor.report': [],
};

export function isStoreOperationAllowed(pluginId: string, operation: string): boolean {
  if (!Object.hasOwn(OPS, operation)) return false;
  const rules = ACCESS[pluginId];
  if (rules === undefined) return false;
  return rules.some((rule) =>
    rule.endsWith('.*') ? operation.startsWith(rule.slice(0, -1)) : operation === rule,
  );
}

type Handler = (...args: never[]) => Promise<unknown>;

/** 扫描 handler 只允许写自己的 payload 前缀，不能借 applyScan 越权写别的域。 */
function ownScanResults(results: unknown, prefix: string): never {
  const rows = Array.isArray(results) ? results : [];
  return rows.filter(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { payload?: unknown }).payload === 'string' &&
      (row as { payload: string }).payload.startsWith(prefix),
  ) as never;
}

const OPS: Readonly<Record<string, Handler>> = {
  'tasks.list': (() => repo.listTasks(db)) as Handler,
  'tasks.create': ((input: never) => repo.createTask(db, input)) as Handler,
  'tasks.update': ((id: never, patch: never, now: never) =>
    repo.updateTask(db, id, patch, now)) as Handler,
  'tasks.setDone': ((id: never, done: never, now: never) =>
    repo.setTaskDone(db, id, done, now)) as Handler,
  'tasks.delete': ((id: never) => repo.deleteTask(db, id)) as Handler,
  'tasks.tags.list': (() => repo.listTagPools(db)) as Handler,
  'tasks.tags.save': ((id: never, name: never, tags: never) =>
    repo.saveTagPool(db, id, name, tags)) as Handler,
  'tasks.tags.delete': ((id: never) => repo.deleteTagPool(db, id)) as Handler,
  'tasks.ensureSubjects': (() => repo.ensureSubjects(db)) as Handler,
  'tasks.applyScan': ((results: never, date: never, now: never) =>
    repo.applyScanResults(db, ownScanResults(results, 'task:'), date, now)) as Handler,
  'subjects.list': (() => repo.listSubjects(db)) as Handler,
  'subjects.create': ((name: never) => repo.createSubject(db, name)) as Handler,
  'subjects.rename': ((id: never, name: never) => repo.renameSubject(db, id, name)) as Handler,
  'subjects.delete': ((id: never) => repo.deleteSubject(db, id)) as Handler,

  'habits.list': (() => repo.listHabits(db)) as Handler,
  'habits.save': ((habit: never) => repo.saveHabit(db, habit)) as Handler,
  'habits.delete': ((id: never) => repo.deleteHabit(db, id)) as Handler,
  'habitLogs.list': ((from: never, to: never) => repo.listHabitLogs(db, from, to)) as Handler,
  'habitLogs.set': ((id: never, date: never, done: never, now: never) =>
    repo.setHabitLog(db, id, date, done, now)) as Handler,
  'checkin.applyScan': ((results: never, date: never, now: never) =>
    repo.applyScanResults(db, ownScanResults(results, 'habit:'), date, now)) as Handler,

  'timetable.load': ((id: never) => repo.loadTimetable(db, id)) as Handler,
  'timetable.save': ((id: never, data: never, now: never) =>
    repo.saveTimetable(db, id, data, now)) as Handler,
  'courseNotes.list': ((date: never) => repo.listCourseNotesByDate(db, date)) as Handler,
  'courseNotes.save': ((note: never, now: never) => repo.saveCourseNote(db, note, now)) as Handler,

  'pomodoro.focus.save': ((run: never) => repo.saveFocusRun(db, run)) as Handler,
  'pomodoro.focus.delete': ((id: never) => repo.deleteFocusRun(db, id)) as Handler,
  'pomodoro.focus.active': (() => repo.listActiveFocusRuns(db)) as Handler,
  'pomodoro.session.add': ((session: never) => repo.addSession(db, session)) as Handler,
  'pomodoro.session.fromRun': (async (run: never, date: never) =>
    repo.sessionFromRun(run, date)) as Handler,
  'config.current': (() => repo.currentConfigOrDefault(db)) as Handler,
  'sessions.range': ((from: never, to: never) =>
    db.sessions.where('date').between(from, to, true, true).toArray()) as Handler,

  'mood.get': ((date: never) => repo.getMoodLog(db, date)) as Handler,
  'mood.list': ((from: never, to: never) => repo.listMoodLogs(db, from, to)) as Handler,
  'mood.save': ((log: never, now: never) => repo.saveMoodLog(db, log, now)) as Handler,
  'mood.applyScan': ((results: never, date: never, now: never) =>
    repo.applyScanResults(db, ownScanResults(results, 'mood:'), date, now)) as Handler,

  'diary.list': ((from: never, to: never) => repo.listDiaryEntries(db, from, to)) as Handler,
  'diary.save': ((entry: never) => repo.saveDiaryEntry(db, entry)) as Handler,
  'diary.delete': ((id: never) => repo.deleteDiaryEntry(db, id)) as Handler,

  'checklists.list': (() => repo.listChecklists(db)) as Handler,
  'checklists.save': ((checklist: never) => repo.saveChecklist(db, checklist)) as Handler,
  'checklists.delete': ((id: never) => repo.deleteChecklist(db, id)) as Handler,
  'checklistLogs.get': ((id: never, date: never) => repo.getChecklistLog(db, id, date)) as Handler,
  'checklistLogs.list': ((from: never, to: never) =>
    repo.listChecklistLogs(db, from, to)) as Handler,
  'checklistLogs.set': ((id: never, date: never, done: never, now: never) =>
    repo.setChecklistLog(db, id, date, done, now)) as Handler,

  'toolbox.add': ((run: never) => repo.addToolboxRun(db, run)) as Handler,

  'scan.batches.list': ((limit: never) => repo.listScanBatches(db, limit)) as Handler,
  'scan.batches.save': ((batch: never) => repo.saveScanBatch(db, batch)) as Handler,
  'scan.batches.status': ((id: never, status: never, now: never) =>
    repo.updateScanBatchStatus(db, id, status, now)) as Handler,
  'scan.manifest.get': ((templateId: never, date: never, paper: never) =>
    repo.getSheetManifest(db, templateId, date, paper)) as Handler,
  'scan.manifestsByDate': ((date: never) =>
    db.sheetManifests.where('date').equals(date).toArray()) as Handler,
  'scan.manifest.save': ((record: never) => repo.saveSheetManifest(db, record)) as Handler,
  'scan.manifest.id': (async (templateId: never, date: never, paper: never) =>
    repo.sheetManifestId(templateId, date, paper)) as Handler,
  'templates.list': (() => repo.listTemplates(db)) as Handler,
};

const cache = new Map<string, PluginStoreLike>();

export function createPluginStore(pluginId: string): PluginStoreLike {
  const existing = cache.get(pluginId);
  if (existing) return existing;
  const store: PluginStoreLike = {
    async call<T>(operation: string, ...args: unknown[]): Promise<T> {
      if (!isStoreOperationAllowed(pluginId, operation)) {
        throw new Error(`插件 ${pluginId} 无权调用数据能力 ${operation}`);
      }
      const handler = OPS[operation];
      if (handler === undefined) throw new Error(`未知数据能力 ${operation}`);
      return (await handler(...(args as never[]))) as T;
    },
  };
  cache.set(pluginId, store);
  return store;
}

/** core 自己调用数据能力：不受插件 allowlist 限制；只允许 core 模块 import。 */
let coreStore: PluginStoreLike | null = null;
export function createCoreStore(): PluginStoreLike {
  if (coreStore) return coreStore;
  coreStore = {
    async call<T>(operation: string, ...args: unknown[]): Promise<T> {
      const handler = OPS[operation];
      if (handler === undefined) throw new Error(`未知数据能力 ${operation}`);
      return (await handler(...(args as never[]))) as T;
    },
  };
  return coreStore;
}
