import 'fake-indexeddb/auto';
import { DEFAULT_APP_CONFIG } from '@gofor/core/config';
import { describe, expect, it } from 'vitest';
import { currentConfigOrDefault, DEFAULT_CONFIG_KEY, readConfig } from './config.ts';
import { GoForDb } from './db.ts';
import {
  createTask,
  ensureSubjects,
  exportAll,
  importAll,
  listTasks,
  saveConfig,
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

  it('拒绝陌生格式', async () => {
    const db = freshDb('export-bad');
    await expect(importAll(db, { format: 'something-else' } as never)).rejects.toThrow(
      '不是 GoFor 导出的文件',
    );
    await db.close();
  });
});
