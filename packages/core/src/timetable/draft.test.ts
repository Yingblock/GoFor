import { describe, expect, it } from 'vitest';
import {
  addDays,
  DAY_LABELS,
  DEFAULT_PERIODS,
  DEFAULT_TERM_WEEKS,
  defaultTimetable,
  mondayOf,
  parseTimetable,
  weekDatesOf,
} from './draft.ts';
import type { TimetableData } from './types.ts';

const TERM_2026: TimetableData['term'] = { id: 'term', startDate: '2026-09-07', weeks: 20 };

function valid(): TimetableData {
  return {
    term: TERM_2026,
    courses: [],
    rules: [],
    overrides: [],
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    weekPatterns: [],
  };
}

describe('课表草稿：内置默认值', () => {
  it('默认 8 节，编号 1..8 且每节 start < end', () => {
    expect(DEFAULT_PERIODS).toHaveLength(8);
    expect(DEFAULT_PERIODS.map((period) => period.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const period of DEFAULT_PERIODS) {
      expect(period.start < period.end).toBe(true);
    }
  });

  it('星期标签从周一到周日', () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe('周一');
    expect(DAY_LABELS[6]).toBe('周日');
  });
});

describe('课表草稿：日期工具', () => {
  it('addDays 跨月 / 跨年 / 闰年', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('mondayOf：周一原样返回，周日算上一周的周一', () => {
    expect(mondayOf('2026-09-07')).toBe('2026-09-07'); // 周一
    expect(mondayOf('2026-09-09')).toBe('2026-09-07'); // 周三
    expect(mondayOf('2026-09-13')).toBe('2026-09-07'); // 周日
  });

  it('weekDatesOf 返回从周一开始的 7 天', () => {
    const dates = weekDatesOf('2026-09-07');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-09-07');
    expect(dates[6]).toBe('2026-09-13');
  });
});

describe('课表草稿：新建默认数据', () => {
  it('开学日落在当前这一周的周一', () => {
    const data = defaultTimetable('default', '2026-09-09');
    expect(data.term.id).toBe('default');
    expect(data.term.startDate).toBe('2026-09-07');
    expect(data.term.weeks).toBe(DEFAULT_TERM_WEEKS);
  });

  it('默认节次是副本：改它不会污染 DEFAULT_PERIODS', () => {
    const data = defaultTimetable('default', '2026-09-09');
    const first = data.periods[0];
    expect(first).toBeDefined();
    if (first) first.start = '99:99';
    expect(DEFAULT_PERIODS[0]?.start).toBe('08:00');
  });

  it('新建时没有规则 / 覆盖 / 周模式', () => {
    const data = defaultTimetable('default', '2026-09-09');
    expect(data.rules).toEqual([]);
    expect(data.overrides).toEqual([]);
    expect(data.weekPatterns).toEqual([]);
  });
});

describe('课表草稿：解析库里的数据', () => {
  it('正常数据原样接受', () => {
    expect(parseTimetable(valid())).toEqual(valid());
  });

  it('缺 courses / rules / overrides / weekPatterns 时补空，不整份判废', () => {
    const legacy = {
      term: TERM_2026,
      periods: [{ index: 1, start: '08:00', end: '08:45' }],
    };
    const parsed = parseTimetable(legacy);
    expect(parsed?.courses).toEqual([]);
    expect(parsed?.rules).toEqual([]);
    expect(parsed?.overrides).toEqual([]);
    expect(parsed?.weekPatterns).toEqual([]);
  });

  it('非对象 / null / 数组都返回 null', () => {
    expect(parseTimetable(null)).toBeNull();
    expect(parseTimetable('x')).toBeNull();
    expect(parseTimetable([])).toBeNull();
  });

  it('periods 缺失或为空返回 null（没有节次就没有行）', () => {
    const missing = { ...valid(), periods: undefined };
    expect(parseTimetable(missing)).toBeNull();
    expect(parseTimetable({ ...valid(), periods: [] })).toBeNull();
  });

  it('term 非法返回 null', () => {
    expect(parseTimetable({ ...valid(), term: undefined })).toBeNull();
    expect(
      parseTimetable({ ...valid(), term: { ...TERM_2026, startDate: '2026/09/07' } }),
    ).toBeNull();
    expect(parseTimetable({ ...valid(), term: { ...TERM_2026, weeks: 0 } })).toBeNull();
    expect(parseTimetable({ ...valid(), term: { ...TERM_2026, weeks: Number.NaN } })).toBeNull();
  });

  it('解析不修改传入对象', () => {
    const legacy = { term: TERM_2026, periods: [{ index: 1, start: '08:00', end: '08:45' }] };
    const snapshot = JSON.stringify(legacy);
    parseTimetable(legacy);
    expect(JSON.stringify(legacy)).toBe(snapshot);
  });
});
