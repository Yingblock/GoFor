import { describe, expect, it } from 'vitest';
import type { CheckboxListBlock, RatingGridBlock } from '../print/blocks.ts';
import { classifyInk, DEFAULT_INK_THRESHOLD } from './classify.ts';
import { buildSheetManifest } from './manifest.ts';

const taskList: CheckboxListBlock = {
  id: 'tasks',
  kind: 'checkboxList',
  span: 12,
  bind: 'tasks.today',
  rows: 2,
  showMeta: [],
};

const rating: RatingGridBlock = {
  id: 'mood',
  kind: 'ratingGrid',
  span: 12,
  labels: ['睡眠'],
  scale: 5,
  keys: ['sleep'],
};

function manifestOf(blocks: (CheckboxListBlock | RatingGridBlock)[]) {
  return buildSheetManifest({
    templateId: 'day',
    date: '2026-03-05',
    paper: 'A5',
    blocks,
    bindings: { 'tasks.today': ['t1', 't2'] },
  });
}

describe('识别结果：阈值', () => {
  it('默认阈值 0.18；等于阈值算勾选', () => {
    expect(DEFAULT_INK_THRESHOLD).toBe(0.18);
    const results = classifyInk(manifestOf([taskList]), [
      { targetId: 'tasks/r1', ink: 0.18 },
      { targetId: 'tasks/r2', ink: 0.179 },
    ]);
    expect(results.map((result) => result.selected)).toEqual([true, false]);
  });

  it('调用方可以覆盖阈值（激进/保守）', () => {
    const manifest = manifestOf([taskList]);
    const loose = classifyInk(manifest, [{ targetId: 'tasks/r1', ink: 0.1 }], { threshold: 0.05 });
    expect(loose[0]?.selected).toBe(true);

    const strict = classifyInk(manifest, [{ targetId: 'tasks/r1', ink: 0.4 }], { threshold: 0.5 });
    expect(strict[0]?.selected).toBe(false);
  });

  it('没有读数的格子也要出现：ink 0、selected false', () => {
    const results = classifyInk(manifestOf([taskList]), [{ targetId: 'tasks/r1', ink: 0.9 }]);
    expect(results).toHaveLength(2);
    expect(results[1]).toEqual({
      targetId: 'tasks/r2',
      label: '第 2 行',
      kind: 'checkbox',
      ink: 0,
      selected: false,
      payload: 'task:t2',
    });
  });
});

describe('识别结果：载荷与数值', () => {
  it('checkbox 的 payload 带 task: 前缀，label/kind 来自注册表', () => {
    const results = classifyInk(manifestOf([taskList]), [
      { targetId: 'tasks/r1', ink: 0.6 },
      { targetId: 'tasks/r2', ink: 0.2 },
    ]);
    expect(results[0]).toMatchObject({
      targetId: 'tasks/r1',
      label: '第 1 行',
      kind: 'checkbox',
      selected: true,
      payload: 'task:t1',
    });
    expect(results[1]?.payload).toBe('task:t2');
  });

  it('slider 带回 1 起的 value 与 mood: 载荷', () => {
    const results = classifyInk(manifestOf([rating]), [{ targetId: 'mood/r1c4', ink: 0.3 }]);
    expect(results).toHaveLength(5);
    const picked = results[3];
    expect(picked).toMatchObject({
      targetId: 'mood/r1c4',
      kind: 'slider',
      value: 4,
      selected: true,
      payload: 'mood:sleep',
      label: '睡眠 4 分',
    });
  });
});

describe('识别结果：输入健壮性', () => {
  it('未知 targetId 忽略；重复读数后一条覆盖前一条', () => {
    const results = classifyInk(manifestOf([taskList]), [
      { targetId: 'ghost', ink: 1 },
      { targetId: 'tasks/r1', ink: 0.9 },
      { targetId: 'tasks/r1', ink: 0.01 },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]?.ink).toBeCloseTo(0.01);
    expect(results[0]?.selected).toBe(false);
  });

  it('墨迹读数夹到 0–1，NaN 按 0', () => {
    const results = classifyInk(manifestOf([taskList]), [
      { targetId: 'tasks/r1', ink: 2 },
      { targetId: 'tasks/r2', ink: Number.NaN },
    ]);
    expect(results[0]?.ink).toBe(1);
    expect(results[0]?.selected).toBe(true);
    expect(results[1]?.ink).toBe(0);
  });

  it('结果顺序与注册表一致（纸面从上到下）', () => {
    const results = classifyInk(manifestOf([taskList, rating]), [
      { targetId: 'mood/r1c2', ink: 0.5 },
    ]);
    expect(results.map((result) => result.targetId)).toEqual([
      'tasks/r1',
      'tasks/r2',
      'mood/r1c1',
      'mood/r1c2',
      'mood/r1c3',
      'mood/r1c4',
      'mood/r1c5',
    ]);
  });
});
