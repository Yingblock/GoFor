import { describe, expect, it } from 'vitest';
import type { Period } from '../config/schema.ts';
import { weekDatesOf } from './draft.ts';
import { buildWeekGrid, cellKeyOf, occupiedCellKeys } from './grid.ts';
import type { Rule, TimetableData } from './types.ts';

const PERIODS: Period[] = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:55', end: '11:40' },
  { index: 5, start: '14:00', end: '14:45' },
  { index: 6, start: '14:55', end: '15:40' },
];

const MON = '2026-09-07';

function dataWith(rules: Rule[]): TimetableData {
  return {
    term: { id: 'term', startDate: MON, weeks: 20 },
    courses: [],
    rules,
    overrides: [],
    periods: PERIODS,
    weekPatterns: [],
  };
}

describe('周视图：连堂合并与格子占用', () => {
  it('同一科目第 2–3 节连排时合并成一整块', () => {
    const data = dataWith([
      {
        id: 'r-math',
        courseId: 'c-math',
        byDay: [1],
        intervalWeeks: 1,
        startPeriod: 2,
        span: 2,
      },
    ]);
    const grid = buildWeekGrid(weekDatesOf(MON), data);
    const monday = grid.get(MON) ?? [];
    expect(monday).toHaveLength(1);
    expect(monday[0]).toMatchObject({ courseId: 'c-math', startPeriod: 2, span: 2 });
  });

  it('中间空一节不合并（那是课间，不是连堂）', () => {
    const data = dataWith([
      { id: 'r-a', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 2, span: 1 },
      { id: 'r-b', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 4, span: 1 },
    ]);
    const monday = buildWeekGrid(weekDatesOf(MON), data).get(MON) ?? [];
    expect(monday).toHaveLength(2);
  });

  it('连堂块占满 span 行的格子（否则下面的格子还能再排课）', () => {
    const data = dataWith([
      { id: 'r-math', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 2, span: 2 },
    ]);
    const cells = occupiedCellKeys(buildWeekGrid(weekDatesOf(MON), data));
    expect(cells.has(cellKeyOf(MON, 2))).toBe(true);
    expect(cells.has(cellKeyOf(MON, 3))).toBe(true);
    expect(cells.has(cellKeyOf(MON, 4))).toBe(false);
  });

  it('一周七天都有键：没课的那天是空数组', () => {
    const grid = buildWeekGrid(weekDatesOf(MON), dataWith([]));
    expect(grid.size).toBe(7);
    expect(grid.get(MON)).toEqual([]);
    expect(grid.get('2026-09-13')).toEqual([]);
  });

  it('规则只排周一时，周二到周日都没有课', () => {
    const data = dataWith([
      { id: 'r-math', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 1, span: 1 },
    ]);
    const grid = buildWeekGrid(weekDatesOf(MON), data);
    expect(grid.get(MON)).toHaveLength(1);
    expect(grid.get('2026-09-08')).toEqual([]);
  });

  it('cellKeyOf 的格式是「日期#节次」', () => {
    expect(cellKeyOf('2026-09-07', 3)).toBe('2026-09-07#3');
  });
});
