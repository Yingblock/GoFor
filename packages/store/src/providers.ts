import type {
  DiaryEntry,
  MoodLog,
  StudySession,
  Subject,
  Task,
  ToolboxRun,
} from '@gofor/core/domain';
import type { Habit } from '@gofor/domain/habits';
import type { GoForDb } from './db.ts';
import {
  listChecklists,
  listDiaryEntries,
  listHabitLogs,
  listHabits,
  listMoodLogs,
  listSubjects,
  listTasks,
  listToolboxRuns,
} from './repositories.ts';

/**
 * 内置数据能力 provider（P3-3.9）。
 *
 * core 自己的数据（学习时长 / 打卡 / 作业 / 三格自评 …）**必须**走与插件相同的
 * `DataContract` 路径，否则"读 core"和"读插件"是两套逻辑，权限与降级语义必然分叉。
 * 周报插件因此可以不 import `@gofor/store` 也能出数（ROADMAP 3.9 的验收）。
 *
 * 这里刻意不 import `@gofor/plugin-api`：结构相同即可赋值，store 不需要为了一个
 * 类型把 React 的 peer 依赖带进来。
 */
export interface BuiltinDataProvider {
  id: string;
  version: number;
  summary: string;
  /**
   * 数据归属插件。插件被禁用时宿主会把这个 provider 一起移除，
   * 消费方看到的是「未安装」，而不是继续读到禁用插件的数据。
   */
  owner?: string;
  query(input: unknown): Promise<unknown>;
  revision(): Promise<number>;
}

interface DateRange {
  from: string;
  to: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readRange(input: unknown): DateRange | null {
  if (typeof input !== 'object' || input === null) return null;
  const { from, to } = input as { from?: unknown; to?: unknown };
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return null;
  if (from > to) return null;
  return { from, to };
}

/**
 * 数据指纹，作为 `revision()` 的返回值。
 *
 * 正确性优先：宿主当前不做跨会话缓存，但契约一写在就可能被插件拿去当缓存键，
 * 所以这里对**内容**取指纹（而不是行数），避免"改了一条记录、时间戳没变"的 stale 缓存。
 * 表都在本地、量级是几百到几千行，代价可接受；真成瓶颈再换索引指纹（记入 LATER）。
 */
function fingerprint(rows: readonly unknown[]): number {
  let hash = 2166136261;
  for (const row of rows) {
    const text = JSON.stringify(row) ?? '';
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return rows.length * 1_000_000_007 + (hash >>> 0);
}

export function createBuiltinDataProviders(database: GoForDb): BuiltinDataProvider[] {
  return [
    {
      id: 'sessions.range',
      version: 1,
      summary: '某一日期区间内的学习记录（番茄钟 + 纸面回填）',
      async query(input) {
        const range = readRange(input);
        if (!range) return [] as StudySession[];
        const rows = await database.sessions
          .where('date')
          .between(range.from, range.to, true, true)
          .toArray();
        return rows.sort((a, b) =>
          a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1,
        );
      },
      async revision() {
        const rows = await database.sessions.toArray();
        return fingerprint(rows);
      },
    },
    {
      id: 'subjects.all',
      version: 1,
      summary: '全部科目（id / 名称 / 排序）',
      async query() {
        return (await listSubjects(database)) as Subject[];
      },
      async revision() {
        return fingerprint(await listSubjects(database));
      },
    },
    {
      id: 'habits.range',
      owner: 'gofor.checkin',
      version: 1,
      summary: '打卡项定义 + 区间内的打卡记录',
      async query(input) {
        const range = readRange(input);
        const habits = (await listHabits(database)) as Habit[];
        if (!range) return { habits, logs: [] };
        const logs = await listHabitLogs(database, range.from, range.to);
        return { habits, logs };
      },
      async revision() {
        return fingerprint([await listHabits(database), await database.habitLogs.toArray()]);
      },
    },
    {
      id: 'mood.range',
      owner: 'gofor.mood',
      version: 1,
      summary: '区间内的三滑块（睡眠 / 心情 / 专注）',
      async query(input) {
        const range = readRange(input);
        if (!range) return [] as MoodLog[];
        return (await listMoodLogs(database, range.from, range.to)) as MoodLog[];
      },
      async revision() {
        return fingerprint(await database.moodLogs.toArray());
      },
    },
    {
      id: 'diary.range',
      owner: 'gofor.diary',
      version: 1,
      summary: '区间内的情绪日记（正文 + 标签）',
      async query(input) {
        const range = readRange(input);
        if (!range) return [] as DiaryEntry[];
        return (await listDiaryEntries(database, range.from, range.to)) as DiaryEntry[];
      },
      async revision() {
        return fingerprint(await database.diaryEntries.toArray());
      },
    },
    {
      id: 'toolbox.recent',
      owner: 'gofor.toolbox',
      version: 1,
      summary: '最近的放松练习记录',
      async query(input) {
        const limit =
          typeof input === 'object' &&
          input !== null &&
          typeof (input as { limit?: unknown }).limit === 'number'
            ? Math.min(1000, Math.max(1, Math.floor((input as { limit: number }).limit)))
            : 200;
        return (await listToolboxRuns(database, limit)) as ToolboxRun[];
      },
      async revision() {
        return fingerprint(await database.toolboxRuns.toArray());
      },
    },
    {
      id: 'tasks.all',
      owner: 'gofor.tasks',
      version: 1,
      summary: '全部作业（含完成状态与截止日期）',
      async query() {
        return (await listTasks(database)) as Task[];
      },
      async revision() {
        return fingerprint(await listTasks(database));
      },
    },
    {
      id: 'checklists.all',
      owner: 'gofor.checklist',
      version: 1,
      summary: '环境清单定义',
      async query() {
        return listChecklists(database);
      },
      async revision() {
        return fingerprint(await listChecklists(database));
      },
    },
  ];
}
