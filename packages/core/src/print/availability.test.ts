import { describe, expect, it } from 'vitest';
import { isPrintBlockKindAvailable, resolvePrintBlocks } from './availability.ts';
import type { Block } from './blocks.ts';

function block(id: string, kind: string): Block {
  return { id, kind: kind as Block['kind'], span: 12 } as Block;
}

const TASKS = { kind: 'checkboxList', pluginId: 'gofor.tasks', name: '作业清单', enabled: true };
const CHECKIN = { kind: 'habitRow', pluginId: 'gofor.checkin', name: '每日打卡', enabled: false };

describe('resolvePrintBlocks', () => {
  it('未归属的 core 区块保留', () => {
    const result = resolvePrintBlocks([block('title', 'title')], []);
    expect(result.blocks.map((item) => item.id)).toEqual(['title']);
    expect(result.warnings).toEqual([]);
    expect(result.owners).toEqual({});
  });

  it('归属插件启用时保留并记录 owner', () => {
    const result = resolvePrintBlocks([block('tasks', 'checkboxList')], [TASKS]);
    expect(result.blocks.map((item) => item.id)).toEqual(['tasks']);
    expect(result.owners).toEqual({ tasks: 'gofor.tasks' });
  });

  it('归属插件禁用时静默跳过，并给出缺失插件警告', () => {
    const result = resolvePrintBlocks(
      [block('habits', 'habitRow'), block('title', 'title')],
      [CHECKIN],
    );
    expect(result.blocks.map((item) => item.id)).toEqual(['title']);
    expect(result.owners).toEqual({});
    expect(result.missing).toEqual([{ pluginId: 'gofor.checkin', name: '每日打卡', count: 1 }]);
    expect(result.warnings[0]).toContain('缺失「每日打卡」插件');
    expect(result.warnings[0]).toContain('1 个区块');
  });

  it('同一插件的多个区块合并计数，只出提示，不画空块', () => {
    const result = resolvePrintBlocks(
      [block('habits-1', 'habitRow'), block('habits-2', 'habitRow')],
      [CHECKIN],
    );
    expect(result.blocks).toEqual([]);
    expect(result.missing[0]?.count).toBe(2);
    expect(result.warnings).toHaveLength(1);
  });

  it('未知 kind 跳过并单独警告（来自旧/外部模板）', () => {
    const result = resolvePrintBlocks([block('weird', 'mysteryBlock')], []);
    expect(result.blocks).toEqual([]);
    expect(result.unknownKinds).toEqual(['mysteryBlock']);
    expect(result.warnings[0]).toContain('无法渲染的区块「mysteryBlock」');
  });

  it('同 kind 的重复归属只认第一个（冲突由宿主报告）', () => {
    const result = resolvePrintBlocks(
      [block('tasks', 'checkboxList')],
      [TASKS, { kind: 'checkboxList', pluginId: 'other.plugin', name: '别的插件', enabled: true }],
    );
    expect(result.owners.tasks).toBe('gofor.tasks');
  });
});

describe('isPrintBlockKindAvailable', () => {
  it('未知 kind 永远不可用', () => {
    expect(isPrintBlockKindAvailable('mysteryBlock', [])).toBe(false);
  });

  it('core 区块可用，owner 插件禁用时不可用', () => {
    expect(isPrintBlockKindAvailable('title', [TASKS, CHECKIN])).toBe(true);
    expect(isPrintBlockKindAvailable('checkboxList', [TASKS])).toBe(true);
    expect(isPrintBlockKindAvailable('habitRow', [CHECKIN])).toBe(false);
  });
});
