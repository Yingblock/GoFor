import type { AppConfig } from '@gofor/core/config';
import type {
  Checklist,
  ChecklistLog,
  CourseNote,
  DiaryEntry,
  HabitLog,
  MoodLog,
  ScanBatch,
  SheetManifestRecord,
  StoredTemplate,
  StoredTimetable,
  StudySession,
  Subject,
  TagPool,
  Task,
  ToolboxRun,
} from '@gofor/core/domain';
import type { Habit } from '@gofor/domain/habits';
import type { PomodoroRun } from '@gofor/domain/pomodoro';
import type { GoForDb } from './db.ts';
import type { PluginDataRow, PluginRecord } from './plugins.ts';
import { loadConfig, saveConfig } from './repositories.ts';

/**
 * 备份切片注册表（P3-3.12）。
 *
 * 为什么把 `exportAll` / `importAll` 从"18 张表硬编码"改成切片：
 * P1 收尾时就漏过 5 张表（打卡 / 课表 / 标签池 / 番茄运行 / 打卡日志），
 * 后果是"备份成功、恢复少一半数据"，用户看不出来。装/卸插件时数据表还可能变，
 * 硬编码必然再次漏。现在新增一张表只需在 `BACKUP_SLICES` 里加一条，
 * 安装页与测试都用同一份清单。
 */
export interface BackupSlice {
  /** 导出包里的字段名，也是 `ImportResult.imported` 的键。 */
  key: string;
  /** 给人看的名字（安装页 / 导入结果）。 */
  label: string;
  read(database: GoForDb): Promise<unknown>;
  /** 返回写入的行数；`value` 是不可信输入，必须自己校验。 */
  write(database: GoForDb, value: unknown): Promise<number>;
}

function rows(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 的数据不是数组`);
  return value;
}

function arraySlice<T>(
  key: string,
  label: string,
  read: (database: GoForDb) => Promise<unknown[]>,
  write: (database: GoForDb, rows: T[]) => Promise<unknown>,
): BackupSlice {
  return {
    key,
    label,
    read,
    async write(database, value) {
      const list = rows(value, label) as T[];
      await write(database, list);
      return list.length;
    },
  };
}

export const BACKUP_SLICES: readonly BackupSlice[] = [
  arraySlice<Subject>(
    'subjects',
    '科目',
    (database) => database.subjects.toArray(),
    (database, list) => database.subjects.bulkPut(list),
  ),
  arraySlice<Task>(
    'tasks',
    '作业',
    (database) => database.tasks.toArray(),
    (database, list) => database.tasks.bulkPut(list),
  ),
  arraySlice<StudySession>(
    'sessions',
    '学习记录',
    (database) => database.sessions.toArray(),
    (database, list) => database.sessions.bulkPut(list),
  ),
  arraySlice<StoredTemplate>(
    'templates',
    '模板',
    (database) => database.templates.toArray(),
    (database, list) => database.templates.bulkPut(list),
  ),
  arraySlice<Habit>(
    'habits',
    '打卡项',
    (database) => database.habits.toArray(),
    (database, list) => database.habits.bulkPut(list),
  ),
  arraySlice<HabitLog>(
    'habitLogs',
    '打卡记录',
    (database) => database.habitLogs.toArray(),
    (database, list) => database.habitLogs.bulkPut(list),
  ),
  arraySlice<StoredTimetable>(
    'timetables',
    '课表',
    (database) => database.timetables.toArray(),
    (database, list) => database.timetables.bulkPut(list),
  ),
  arraySlice<TagPool>(
    'tagPools',
    '标签池',
    (database) => database.tagPools.toArray(),
    (database, list) => database.tagPools.bulkPut(list),
  ),
  arraySlice<PomodoroRun>(
    'focusRuns',
    '番茄运行态',
    (database) => database.focusRuns.toArray(),
    (database, list) => database.focusRuns.bulkPut(list),
  ),
  arraySlice<MoodLog>(
    'moodLogs',
    '三滑块',
    (database) => database.moodLogs.toArray(),
    (database, list) => database.moodLogs.bulkPut(list),
  ),
  arraySlice<DiaryEntry>(
    'diaryEntries',
    '情绪日记',
    (database) => database.diaryEntries.toArray(),
    (database, list) => database.diaryEntries.bulkPut(list),
  ),
  arraySlice<ToolboxRun>(
    'toolboxRuns',
    '练习记录',
    (database) => database.toolboxRuns.toArray(),
    (database, list) => database.toolboxRuns.bulkPut(list),
  ),
  arraySlice<Checklist>(
    'checklists',
    '环境清单',
    (database) => database.checklists.toArray(),
    (database, list) => database.checklists.bulkPut(list),
  ),
  arraySlice<ChecklistLog>(
    'checklistLogs',
    '清单完成记录',
    (database) => database.checklistLogs.toArray(),
    (database, list) => database.checklistLogs.bulkPut(list),
  ),
  arraySlice<ScanBatch>(
    'scanBatches',
    '扫描批次',
    (database) => database.scanBatches.toArray(),
    (database, list) => database.scanBatches.bulkPut(list),
  ),
  arraySlice<SheetManifestRecord>(
    'sheetManifests',
    '打印坐标清单',
    (database) => database.sheetManifests.toArray(),
    (database, list) => database.sheetManifests.bulkPut(list),
  ),
  arraySlice<CourseNote>(
    'courseNotes',
    '课程备注',
    (database) => database.courseNotes.toArray(),
    (database, list) => database.courseNotes.bulkPut(list),
  ),
  // P3：插件注册记录与插件通用数据容器。
  // 它们既是"一张表一条切片"的例子，也是装/卸插件时不用改 repositories 的原因。
  arraySlice<PluginRecord>(
    'plugins',
    '插件',
    (database) => database.plugins.toArray(),
    (database, list) => database.plugins.bulkPut(list),
  ),
  arraySlice<PluginDataRow>(
    'pluginData',
    '插件数据',
    (database) => database.pluginData.toArray(),
    (database, list) => database.pluginData.bulkPut(list),
  ),
] as const;

/** 格式版本：v2 起包含 plugins / pluginData；v1 的旧文件仍可导入。 */
export const EXPORT_FORMAT_VERSION = 2;

/**
 * 导出包。
 *
 * 字段与切片 key 一一对应；`subjects` / `tasks` / `sessions` / `templates`
 * 保持必填是为了不破坏旧调用方（它们从 P0 起就存在）。新增切片时这里补一个可选字段。
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
  courseNotes?: CourseNote[];
  plugins?: PluginRecord[];
  pluginData?: PluginDataRow[];
}

export interface ImportResult {
  /** 切片 key → 导入行数（缺失的切片记 0）。 */
  imported: Record<string, number>;
  warnings: string[];
}

const BUNDLE_RESERVED_KEYS = new Set(['format', 'formatVersion', 'exportedAt', 'config']);

export async function exportAll(database: GoForDb): Promise<ExportBundle> {
  const { config } = await loadConfig(database);
  const bundle: Record<string, unknown> = {
    format: 'gofor-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    config,
  };
  for (const slice of BACKUP_SLICES) {
    bundle[slice.key] = await slice.read(database);
  }
  return bundle as unknown as ExportBundle;
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
  const imported: Record<string, number> = {};

  const known = new Set(BACKUP_SLICES.map((slice) => slice.key));
  for (const key of Object.keys(bundle)) {
    if (BUNDLE_RESERVED_KEYS.has(key) || known.has(key)) continue;
    warnings.push(`忽略不认识的字段：${key}`);
  }

  const source = bundle as unknown as Record<string, unknown>;

  // 整包一个事务：中途失败不能留下"导了一半"的库。
  await database.transaction('rw', database.tables, async () => {
    if (bundle.config) await saveConfig(database, bundle.config);
    for (const slice of BACKUP_SLICES) {
      const value = source[slice.key];
      if (value === undefined) {
        // 旧版本导出文件没有新表：按 0 处理，不能报错。
        imported[slice.key] = 0;
        continue;
      }
      imported[slice.key] = await slice.write(database, value);
    }
  });

  return { imported, warnings };
}
