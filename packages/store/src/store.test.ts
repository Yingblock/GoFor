import 'fake-indexeddb/auto';
import { DEFAULT_APP_CONFIG } from '@gofor/core/config';
import type { StoredTemplate, StudySession, Subject, Task } from '@gofor/core/domain';
import type { PomodoroRun } from '@gofor/core/pomodoro';
import Dexie, { type Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import { currentConfigOrDefault, DEFAULT_CONFIG_KEY, readConfig } from './config.ts';
import { GoForDb } from './db.ts';
import {
  createTask,
  deleteFocusRun,
  ensureSubjects,
  exportAll,
  getCheckin,
  importAll,
  listActiveFocusRuns,
  listCheckins,
  listHabitLogs,
  listTasks,
  loadFocusRun,
  saveConfig,
  saveFocusRun,
  saveHabit,
  saveTagPool,
  saveTimetable,
  sessionFromRun,
  setCheckin,
  setHabitLog,
  setTaskDone,
} from './repositories.ts';

/** 每个用例用独立的库名，避免互相污染。 */
function freshDb(label: string): GoForDb {
  return new GoForDb(`gofor-test-${label}-${Math.random().toString(36).slice(2)}`);
}

describe('存储：配置', () => {
  it('首次读取时写入出厂默认', async () => {
    const db = freshDb('config-init');
    const { config, warnings } = await currentConfigOrDefault(db);

    expect(config).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
    expect(await db.config.count()).toBe(1);
    await db.close();
  });

  it('保存后再读回来一致', async () => {
    const db = freshDb('config-roundtrip');
    await currentConfigOrDefault(db);
    await saveConfig(db, {
      ...DEFAULT_APP_CONFIG,
      print: { ...DEFAULT_APP_CONFIG.print, paper: 'A4' },
    });

    const { config } = await currentConfigOrDefault(db);
    expect(config.print.paper).toBe('A4');
    await db.close();
  });

  it('readConfig 只读不写（liveQuery 的硬约束）', async () => {
    const db = freshDb('config-readonly');
    await currentConfigOrDefault(db);
    const before = await db.config.get(DEFAULT_CONFIG_KEY);

    // 清掉再读：只读路径不应该顺手把默认值写回去
    await db.config.clear();
    const config = await readConfig(db);

    expect(config).toEqual(DEFAULT_APP_CONFIG);
    expect(await db.config.count()).toBe(0);
    expect(before).toBeDefined();
    await db.close();
  });

  it('库里是坏 JSON 时回退到默认而不是崩溃', async () => {
    const db = freshDb('config-corrupt');
    await db.config.put({ key: DEFAULT_CONFIG_KEY, value: '{not json', updatedAt: 0 });

    const { config, warnings } = await currentConfigOrDefault(db);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings.join()).toContain('出厂默认');
    await db.close();
  });

  it('库里是合法 JSON 但字段非法时也回退', async () => {
    const db = freshDb('config-invalid');
    await db.config.put({
      key: DEFAULT_CONFIG_KEY,
      value: JSON.stringify({ schemaVersion: 1, periods: 'nonsense' }),
      updatedAt: 0,
    });

    const { config, warnings } = await currentConfigOrDefault(db);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings.length).toBeGreaterThan(0);
    await db.close();
  });
});

describe('存储：科目与任务', () => {
  it('首次播种科目，第二次不再重复', async () => {
    const db = freshDb('subjects');
    const first = await ensureSubjects(db);
    const second = await ensureSubjects(db);

    expect(first).toHaveLength(6);
    expect(first[0]?.name).toBe('语文');
    expect(second).toEqual(first);
    await db.close();
  });

  it('任务按 sortKey 递增排布', async () => {
    const db = freshDb('tasks');
    await createTask(db, { id: 'a', title: '数学卷子', now: 1 });
    await createTask(db, { id: 'b', title: '英语听力', now: 2 });

    const tasks = await listTasks(db);
    expect(tasks.map((task) => task.id)).toEqual(['a', 'b']);
    expect(tasks[0]?.sortKey).toBeLessThan(tasks[1]?.sortKey ?? 0);
    await db.close();
  });

  it('切换完成状态', async () => {
    const db = freshDb('task-toggle');
    await createTask(db, { id: 'a', title: '物理错题', now: 1 });
    await setTaskDone(db, 'a', true, 2);

    const [task] = await listTasks(db);
    expect(task?.done).toBe(true);
    expect(task?.updatedAt).toBe(2);
    await db.close();
  });
});

describe('存储：导入导出', () => {
  it('导出再导入不丢数据', async () => {
    const source = freshDb('export-src');
    await currentConfigOrDefault(source);
    await ensureSubjects(source);
    await createTask(source, { id: 't1', title: '化学实验报告', now: 10 });

    const bundle = await exportAll(source);
    expect(bundle.format).toBe('gofor-export');
    expect(bundle.tasks).toHaveLength(1);

    const target = freshDb('export-dst');
    const result = await importAll(target, bundle);

    expect(result.imported.tasks).toBe(1);
    expect((await listTasks(target))[0]?.title).toBe('化学实验报告');
    expect((await ensureSubjects(target))[0]?.name).toBe('语文');
    await source.close();
    await target.close();
  });

  it('导出必须包含所有会持久化的表（打卡 / 课表 / 标签池 / 番茄运行）', async () => {
    const source = freshDb('export-all-tables');
    await currentConfigOrDefault(source);
    await createTask(source, { id: 't1', title: '化学实验报告', now: 10 });
    await saveHabit(source, {
      id: 'h1',
      name: '背单词',
      weekdays: [],
      startDate: '2026-03-01',
      endDate: null,
      order: 0,
      createdAt: 1,
    });
    await setHabitLog(source, 'h1', '2026-03-02', true, 2);
    await saveTimetable(
      source,
      'default',
      {
        term: { id: 'default', startDate: '2026-03-02', weeks: 20 },
        courses: [],
        rules: [],
        overrides: [],
        periods: [{ index: 1, start: '08:00', end: '08:45' }],
        weekPatterns: [],
      },
      3,
    );
    await saveTagPool(source, 'pool-1', '学校', ['晚自习']);
    await saveFocusRun(source, sampleRun());

    const bundle = await exportAll(source);
    expect(bundle.habits).toHaveLength(1);
    expect(bundle.habitLogs).toHaveLength(1);
    expect(bundle.timetables).toHaveLength(1);
    expect(bundle.tagPools).toHaveLength(1);
    expect(bundle.focusRuns).toHaveLength(1);

    const target = freshDb('export-all-tables-dst');
    const result = await importAll(target, bundle);
    expect(result.imported).toMatchObject({
      habits: 1,
      habitLogs: 1,
      timetables: 1,
      tagPools: 1,
      focusRuns: 1,
    });
    // 真的落库了才算数：只断言计数的话，importAll 里漏写一张表也能过。
    expect((await target.habits.get('h1'))?.name).toBe('背单词');
    expect(await target.habitLogs.count()).toBe(1);
    expect(await target.timetables.count()).toBe(1);
    expect(await target.tagPools.count()).toBe(1);
    expect(await target.focusRuns.count()).toBe(1);
    await source.close();
    await target.close();
  });

  it('旧版本导出文件（没有新表）照常导入，不算错误', async () => {
    const target = freshDb('export-legacy-import');
    await createTask(target, { id: 'keep', title: '已有任务', now: 1 });

    const legacy = {
      format: 'gofor-export',
      formatVersion: 1,
      exportedAt: 1,
      subjects: [],
      tasks: [],
      sessions: [],
      templates: [],
    };
    const result = await importAll(target, legacy as never);
    expect(result.imported.habits).toBe(0);
    // 合并语义：导入空包不能把已有数据清空
    expect(await target.tasks.count()).toBe(1);
    await target.close();
  });

  it('拒绝陌生格式', async () => {
    const db = freshDb('export-bad');
    await expect(importAll(db, { format: 'something-else' } as never)).rejects.toThrow(
      '不是 GoFor 导出的文件',
    );
    await db.close();
  });
});

/* ---------------------------------------------------------- 番茄钟运行态 */

function sampleRun(overrides: Partial<PomodoroRun> = {}): PomodoroRun {
  return {
    id: 'run-a',
    phase: 'focus',
    subjectId: 'subject-2',
    taskId: null,
    plannedMs: 45 * 60_000,
    startedAtWall: 1_000_000,
    startedAtMono: 0,
    accumulatedMs: 0,
    status: 'running',
    interruptions: 0,
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe('存储：番茄钟运行态', () => {
  it('保存后能读回', async () => {
    const db = freshDb('focus-roundtrip');
    await saveFocusRun(db, sampleRun());

    const loaded = await loadFocusRun(db, 'run-a');
    expect(loaded?.plannedMs).toBe(45 * 60_000);
    expect(loaded?.status).toBe('running');
    await db.close();
  });

  it('只挑出未结算的运行（用于启动时恢复）', async () => {
    const db = freshDb('focus-active');
    await saveFocusRun(db, sampleRun({ id: 'a', status: 'running' }));
    await saveFocusRun(db, sampleRun({ id: 'b', status: 'paused' }));
    await saveFocusRun(db, sampleRun({ id: 'c', status: 'finished' }));
    await saveFocusRun(db, sampleRun({ id: 'd', status: 'abandoned' }));

    const active = await listActiveFocusRuns(db);
    expect(active.map((run) => run.id).sort()).toEqual(['a', 'b']);
    await db.close();
  });

  it('删除后查不到', async () => {
    const db = freshDb('focus-delete');
    await saveFocusRun(db, sampleRun());
    await deleteFocusRun(db, 'run-a');
    expect(await loadFocusRun(db, 'run-a')).toBeUndefined();
    await db.close();
  });

  it('状态更新是覆盖而不是追加', async () => {
    const db = freshDb('focus-update');
    await saveFocusRun(db, sampleRun());
    await saveFocusRun(db, sampleRun({ status: 'paused', accumulatedMs: 60_000 }));

    const loaded = await loadFocusRun(db, 'run-a');
    expect(loaded?.status).toBe('paused');
    expect(loaded?.accumulatedMs).toBe(60_000);
    expect(await db.focusRuns.count()).toBe(1);
    await db.close();
  });
});

describe('存储：番茄转学习记录', () => {
  it('按实际用时生成 session', () => {
    const session = sessionFromRun(
      sampleRun({ accumulatedMs: 45 * 60_000, subjectId: 'subject-2' }),
      '2026-03-05',
    );

    expect(session.date).toBe('2026-03-05');
    expect(session.end - session.start).toBe(45);
    expect(session.subjectId).toBe('subject-2');
    expect(session.source).toBe('appTimer');
  });
});

/* ------------------------------------------------------- schema 迁移 v1→v2 */

/** 只声明 v1 schema 的库，用来验证升级路径。 */
class V1Db extends Dexie {
  config!: Table<{ key: string; value: string; updatedAt: number }, string>;
  tasks!: Table<Task, string>;
  subjects!: Table<Subject, string>;
  sessions!: Table<StudySession, string>;
  templates!: Table<StoredTemplate, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    });
  }
}

/** 只声明到 v2 的库（不含 tagPools），用来验证 v2 → v3。 */
class V2Db extends Dexie {
  config!: Table<{ key: string; value: string; updatedAt: number }, string>;
  tasks!: Table<Task, string>;
  subjects!: Table<Subject, string>;
  sessions!: Table<StudySession, string>;
  templates!: Table<StoredTemplate, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    });
    this.version(2).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    });
  }
}

/** 只声明到 v3 的库，用来验证 v3 → v4 的打卡迁移。 */
class V3Db extends Dexie {
  config!: Table<{ key: string; value: string; updatedAt: number }, string>;
  tasks!: Table<Task, string>;
  subjects!: Table<Subject, string>;
  sessions!: Table<StudySession, string>;
  templates!: Table<StoredTemplate, string>;
  checkins!: Table<{ date: string; done: boolean; note: string | null; updatedAt: number }, string>;

  constructor(name: string) {
    super(name);
    const schema = {
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    };
    this.version(1).stores(schema);
    this.version(2).stores({ ...schema, checkins: 'date' });
    this.version(3).stores({ ...schema });
  }
}

describe('存储：schema 升级 v3 → v4（旧打卡迁移成默认习惯）', () => {
  it('把旧的 daily checkin 迁移成一条「学习」习惯的历史', async () => {
    const name = `gofor-v4-${Math.random().toString(36).slice(2)}`;

    const old = new V3Db(name);
    // v3 的 checkins 表来自 v2，这里直接写两条已完成的记录
    await old.table('checkins').bulkPut([
      { date: '2026-03-01', done: true, note: null, updatedAt: 1 },
      { date: '2026-03-02', done: false, note: null, updatedAt: 1 },
      { date: '2026-03-03', done: true, note: null, updatedAt: 1 },
    ]);
    old.close();

    const upgraded = new GoForDb(name);
    const habits = await upgraded.habits.toArray();
    expect(habits).toHaveLength(1);
    expect(habits[0]?.name).toBe('学习');
    expect(habits[0]?.startDate).toBe('2026-03-01');

    const logs = await upgraded.habitLogs.toArray();
    expect(logs.map((log) => log.date).sort()).toEqual(['2026-03-01', '2026-03-03']);
    upgraded.close();
  });
});

describe('存储：schema 升级 v2 → v3（tagPools 必须新建）', () => {
  it('停在 v2 的库升级后会补出 tagPools 表，且旧数据仍在', async () => {
    const name = `gofor-v3-${Math.random().toString(36).slice(2)}`;

    const old = new V2Db(name);
    await old.tasks.put({
      id: 't1',
      title: 'v2 时期写入',
      subjectId: null,
      done: false,
      due: null,
      sortKey: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    old.close();

    const upgraded = new GoForDb(name);
    expect((await upgraded.tasks.toArray())[0]?.title).toBe('v2 时期写入');

    // 关键断言：v2 的库里没有这张表，升级后必须能写
    await upgraded.tagPools.put({ id: 'pool-1', name: '错因', tags: ['计算失误'] });
    expect(await upgraded.tagPools.count()).toBe(1);
    upgraded.close();
  });
});

describe('存储：schema 升级 v1 → v2', () => {
  it('升级后旧数据仍在，新表可用', async () => {
    const name = `gofor-migrate-${Math.random().toString(36).slice(2)}`;

    const old = new V1Db(name);
    await old.tasks.put({
      id: 't1',
      title: '升级前写入的作业',
      subjectId: null,
      done: false,
      due: null,
      sortKey: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    old.close();

    const upgraded = new GoForDb(name);
    const tasks = await upgraded.tasks.toArray();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('升级前写入的作业');

    // 新表在升级后可写
    await saveFocusRun(upgraded, sampleRun({ id: 'after-upgrade' }));
    expect(await upgraded.focusRuns.count()).toBe(1);
    upgraded.close();
  });
});

/* ------------------------------------------------------------------ 打卡 */

describe('存储：每日打卡', () => {
  it('同一天重复写入是覆盖而不是追加', async () => {
    const db = freshDb('checkin-overwrite');
    await setCheckin(db, { date: '2026-03-05', done: false }, 1);
    await setCheckin(db, { date: '2026-03-05', done: true, note: '晚自习很专注' }, 2);

    const record = await getCheckin(db, '2026-03-05');
    expect(record?.done).toBe(true);
    expect(record?.note).toBe('晚自习很专注');
    expect(record?.updatedAt).toBe(2);
    expect(await db.checkins.count()).toBe(1);
    await db.close();
  });

  it('闭区间查询按日期升序', async () => {
    const db = freshDb('checkin-range');
    for (const date of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-09']) {
      await setCheckin(db, { date, done: true }, 1);
    }

    const records = await listCheckins(db, '2026-03-02', '2026-03-05');
    expect(records.map((item) => item.date)).toEqual(['2026-03-03', '2026-03-05']);
    await db.close();
  });

  it('没打卡的日期查不到', async () => {
    const db = freshDb('checkin-empty');
    expect(await getCheckin(db, '2026-03-05')).toBeUndefined();
    await db.close();
  });
});

describe('存储：打卡日志（走 date 索引）', () => {
  it('闭区间含两端，范围外不返回，且按日期升序', async () => {
    const db = freshDb('habit-logs-range');
    for (const date of ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-09']) {
      await setHabitLog(db, 'h1', date, true, 1);
    }

    const logs = await listHabitLogs(db, '2026-03-03', '2026-03-05');
    expect(logs.map((log) => log.date)).toEqual(['2026-03-03', '2026-03-05']);
    await db.close();
  });

  it('一次返回所有打卡项在该区间的记录（调用方自己按 habitId 分组）', async () => {
    const db = freshDb('habit-logs-multi');
    await setHabitLog(db, 'h1', '2026-03-03', true, 1);
    await setHabitLog(db, 'h2', '2026-03-03', true, 1);
    await setHabitLog(db, 'h2', '2026-03-04', false, 1);

    const logs = await listHabitLogs(db, '2026-03-03', '2026-03-03');
    expect(logs.map((log) => log.habitId).sort()).toEqual(['h1', 'h2']);
    // done=false 也是一条记录，不能被区间查询吞掉
    const all = await listHabitLogs(db, '2026-03-03', '2026-03-04');
    expect(all).toHaveLength(3);
    await db.close();
  });

  it('空库里返回空数组而不是抛错', async () => {
    const db = freshDb('habit-logs-empty');
    expect(await listHabitLogs(db, '2026-01-01', '2026-12-31')).toEqual([]);
    await db.close();
  });
});
