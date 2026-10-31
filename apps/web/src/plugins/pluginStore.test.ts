import { describe, expect, it } from 'vitest';
import { isStoreOperationAllowed } from './pluginStore.ts';

describe('构建期插件 store 权限', () => {
  it('只允许插件访问自己归属的能力', () => {
    expect(isStoreOperationAllowed('gofor.tasks', 'tasks.list')).toBe(true);
    expect(isStoreOperationAllowed('gofor.tasks', 'tasks.setDone')).toBe(true);
    expect(isStoreOperationAllowed('gofor.tasks', 'habits.list')).toBe(false);
    expect(isStoreOperationAllowed('gofor.checkin', 'habits.list')).toBe(true);
    expect(isStoreOperationAllowed('gofor.checkin', 'tasks.list')).toBe(false);
    expect(isStoreOperationAllowed('gofor.mood', 'mood.list')).toBe(true);
    expect(isStoreOperationAllowed('gofor.mood', 'tasks.list')).toBe(false);
  });

  it('共享科目只给需要的插件；写操作只给课表', () => {
    expect(isStoreOperationAllowed('gofor.tasks', 'subjects.list')).toBe(true);
    expect(isStoreOperationAllowed('gofor.pomodoro', 'subjects.list')).toBe(true);
    expect(isStoreOperationAllowed('gofor.tasks', 'subjects.delete')).toBe(false);
    expect(isStoreOperationAllowed('gofor.timetable', 'subjects.delete')).toBe(true);
  });

  it('未知插件/未知操作一律拒绝', () => {
    expect(isStoreOperationAllowed('evil.plugin', 'tasks.list')).toBe(false);
    expect(isStoreOperationAllowed('gofor.tasks', 'tasks.unknown')).toBe(false);
  });
});
