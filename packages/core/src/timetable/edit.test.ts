import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIODS } from './draft.ts';
import {
  addCancelOverride,
  addRule,
  addRuleForCell,
  appendPeriod,
  removePeriodAt,
  removeRule,
  updatePeriodAt,
} from './edit.ts';
import type { TimetableData } from './types.ts';

function empty(): TimetableData {
  return {
    term: { id: 'term', startDate: '2026-09-07', weeks: 20 },
    courses: [],
    rules: [],
    overrides: [],
    periods: DEFAULT_PERIODS.slice(0, 4).map((period) => ({ ...period })),
    weekPatterns: [],
  };
}

describe('课表编辑：规则', () => {
  it('addRule 补齐 span=1 / intervalWeeks=1', () => {
    const data = addRule(empty(), {
      id: 'r1',
      courseId: 'c-math',
      byDay: [1, 3],
      startPeriod: 2,
    });
    expect(data.rules).toHaveLength(1);
    expect(data.rules[0]).toMatchObject({
      id: 'r1',
      courseId: 'c-math',
      byDay: [1, 3],
      startPeriod: 2,
      span: 1,
      intervalWeeks: 1,
    });
  });

  it('addRule 不修改原数据', () => {
    const original = empty();
    addRule(original, { id: 'r1', courseId: 'c', byDay: [1], startPeriod: 1 });
    expect(original.rules).toHaveLength(0);
  });

  it('addRuleForCell 只排被点的那一天那一节，span 固定 1', () => {
    const data = addRuleForCell(empty(), {
      id: 'r1',
      courseId: 'c-math',
      day: 4,
      periodIndex: 3,
    });
    expect(data.rules[0]?.byDay).toEqual([4]);
    expect(data.rules[0]?.startPeriod).toBe(3);
    expect(data.rules[0]?.span).toBe(1);
  });

  it('removeRule 只删指定 id，别的规则留下', () => {
    let data = empty();
    data = addRule(data, { id: 'r1', courseId: 'c', byDay: [1], startPeriod: 1 });
    data = addRule(data, { id: 'r2', courseId: 'c', byDay: [2], startPeriod: 2 });
    expect(removeRule(data, 'r1').rules.map((rule) => rule.id)).toEqual(['r2']);
  });

  it('removeRule 删不存在的 id 时原样返回', () => {
    const data = addRule(empty(), { id: 'r1', courseId: 'c', byDay: [1], startPeriod: 1 });
    expect(removeRule(data, 'nope')).toEqual(data);
  });

  it('addCancelOverride 追加一次停课', () => {
    const data = addCancelOverride(empty(), { id: 'o1', ruleId: 'r1', date: '2026-10-01' });
    expect(data.overrides).toEqual([
      { id: 'o1', ruleId: 'r1', date: '2026-10-01', action: 'cancel' },
    ]);
  });
});

describe('课表编辑：作息表', () => {
  it('updatePeriodAt 只改目标那一节', () => {
    const data = updatePeriodAt(empty(), 1, { start: '09:00' });
    expect(data.periods[1]?.start).toBe('09:00');
    expect(data.periods[0]?.start).toBe(DEFAULT_PERIODS[0]?.start);
  });

  it('updatePeriodAt 越界时原样返回', () => {
    const original = empty();
    expect(updatePeriodAt(original, 99, { start: '09:00' })).toBe(original);
    expect(updatePeriodAt(original, -1, { start: '09:00' })).toBe(original);
  });

  it('removePeriodAt 删掉后重新编号，保持 1..n 连续', () => {
    const data = removePeriodAt(empty(), 1); // 删第 2 节
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3]);
    expect(data.periods[1]?.start).toBe(DEFAULT_PERIODS[2]?.start);
  });

  it('removePeriodAt 越界时原样返回', () => {
    const original = empty();
    expect(removePeriodAt(original, 4)).toBe(original);
  });

  it('appendPeriod 编号接在现有节数之后', () => {
    const data = appendPeriod(empty(), { start: '18:30', end: '19:15' });
    expect(data.periods).toHaveLength(5);
    expect(data.periods[4]).toEqual({ index: 5, start: '18:30', end: '19:15' });
  });
});
