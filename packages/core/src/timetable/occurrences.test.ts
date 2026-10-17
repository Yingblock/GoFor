import { describe, expect, it } from 'vitest';
import type { Period } from '../config/schema.ts';
import {
  isOddWeek,
  mergeAdjacent,
  occurrencesInWeek,
  occurrencesOn,
  patternOf,
  weekOfTerm,
} from './occurrences.ts';
import type { Course, Override, Rule, Term, TimetableData, WeekPatternRange } from './types.ts';

/** 第 1 节 08:00–08:45，第 2 节 08:55–09:40，第 3 节 10:00–10:45，第 4 节 10:55–11:40。 */
const PERIODS: Period[] = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:55', end: '11:40' },
];

/** 2026-09-07 是周一；20 周覆盖到 2027-01-24，可顺带测跨月、跨年。 */
const TERM: Term = { id: 'term-2026-fall', startDate: '2026-09-07', weeks: 20 };

const COURSES: Course[] = [
  { id: 'c-math', name: '数学' },
  { id: 'c-chinese', name: '语文' },
  { id: 'c-art', name: '美术' },
];

const RULES: Rule[] = [
  // 周一、周三 1–2 节连堂
  { id: 'r-math', courseId: 'c-math', byDay: [1, 3], intervalWeeks: 1, startPeriod: 1, span: 2 },
  // 周二第 3 节
  { id: 'r-chinese', courseId: 'c-chinese', byDay: [2], intervalWeeks: 1, startPeriod: 3 },
  // 单周周五第 4 节
  { id: 'r-art', courseId: 'c-art', byDay: [5], intervalWeeks: 2, startPeriod: 4 },
];

/** 每周固定日期（第 1 周 / 第 2 周），测试里直接引用，避免手算错。 */
const MON_W1 = '2026-09-07';
const TUE_W1 = '2026-09-08';
const WED_W1 = '2026-09-09';
const FRI_W1 = '2026-09-11';
const SUN_W1 = '2026-09-13';
const MON_W2 = '2026-09-14';
const TUE_W2 = '2026-09-15';
const FRI_W2 = '2026-09-18';

const HOLIDAY: WeekPatternRange = { from: '2026-10-01', to: '2026-10-07', pattern: 'holiday' };

function makeData(
  overrides: Override[] = [],
  weekPatterns: WeekPatternRange[] = [],
): TimetableData {
  return {
    term: TERM,
    courses: COURSES,
    rules: RULES,
    overrides,
    periods: PERIODS,
    weekPatterns,
  };
}

describe('weekOfTerm', () => {
  it('第一周的周一是第 1 周，同一周内每一天也算第 1 周', () => {
    expect(weekOfTerm(TERM, MON_W1)).toBe(1);
    expect(weekOfTerm(TERM, SUN_W1)).toBe(1);
  });

  it('学期开始之前返回 null', () => {
    expect(weekOfTerm(TERM, '2026-09-06')).toBeNull();
  });

  it('最后一周的最后一天仍在学期内，再往后返回 null', () => {
    expect(weekOfTerm(TERM, '2027-01-24')).toBe(20);
    expect(weekOfTerm(TERM, '2027-01-25')).toBeNull();
  });

  it('跨月：2026-10-05 是第 5 周周一', () => {
    expect(weekOfTerm(TERM, '2026-10-05')).toBe(5);
  });

  it('跨年：学期 2026-09-01 开始，2027-01-05 是第 19 周', () => {
    const term: Term = { id: 'term-cross-year', startDate: '2026-09-01', weeks: 20 };
    expect(weekOfTerm(term, '2027-01-05')).toBe(19);
  });

  it('非法日期返回 null，而不是算出一个错误的周次', () => {
    expect(weekOfTerm(TERM, '2026-9-7')).toBeNull();
    expect(weekOfTerm(TERM, '2026-02-31')).toBeNull();
    expect(weekOfTerm(TERM, 'not-a-date')).toBeNull();
  });
});

describe('isOddWeek', () => {
  it('单周为 true，双周为 false', () => {
    expect(isOddWeek(TERM, MON_W1)).toBe(true); // 第 1 周
    expect(isOddWeek(TERM, MON_W2)).toBe(false); // 第 2 周
    expect(isOddWeek(TERM, '2026-09-21')).toBe(true); // 第 3 周
  });

  it('学期外不算单周', () => {
    expect(isOddWeek(TERM, '2026-09-06')).toBe(false);
    expect(isOddWeek(TERM, '2027-01-25')).toBe(false);
  });
});

describe('patternOf', () => {
  it('未命中任何区间视为 normal', () => {
    expect(patternOf(MON_W1, [])).toBe('normal');
    expect(patternOf(MON_W1, [HOLIDAY])).toBe('normal');
  });

  it('区间两端都包含', () => {
    expect(patternOf('2026-10-01', [HOLIDAY])).toBe('holiday');
    expect(patternOf('2026-10-07', [HOLIDAY])).toBe('holiday');
  });

  it('重叠时后声明的区间覆盖先声明的', () => {
    const exception: WeekPatternRange = {
      from: '2026-10-05',
      to: '2026-10-05',
      pattern: 'normal',
    };
    expect(patternOf('2026-10-05', [HOLIDAY, exception])).toBe('normal');
  });
});

describe('occurrencesOn：常规排课', () => {
  it('同一条 rule 只在 byDay 命中的那天出现', () => {
    const monday = occurrencesOn(MON_W1, makeData());
    expect(monday.map((occurrence) => occurrence.ruleId)).toEqual(['r-math']);

    const tuesday = occurrencesOn(TUE_W1, makeData());
    expect(tuesday.map((occurrence) => occurrence.ruleId)).toEqual(['r-chinese']);
  });

  it('星期几按 1=周一 … 7=周日 匹配：周日没有课', () => {
    expect(occurrencesOn(SUN_W1, makeData())).toEqual([]);
  });

  it('连堂合并成一条 Occurrence，分钟数取首节开始与末节结束', () => {
    const occurrences = occurrencesOn(MON_W1, makeData());
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      key: `r-math@${MON_W1}#1`,
      date: MON_W1,
      courseId: 'c-math',
      ruleId: 'r-math',
      startPeriod: 1,
      span: 2,
      startMinute: 8 * 60,
      endMinute: 9 * 60 + 40,
      overridden: false,
    });
  });

  it('span 缺省为 1', () => {
    const occurrences = occurrencesOn(TUE_W1, makeData());
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      span: 1,
      startMinute: 10 * 60,
      endMinute: 10 * 60 + 45,
    });
  });

  it('按 startMinute 升序，即使规则数组里顺序相反', () => {
    const data: TimetableData = {
      ...makeData(),
      rules: [
        { id: 'r-late', courseId: 'c-art', byDay: [1], intervalWeeks: 1, startPeriod: 4 },
        { id: 'r-early', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 1 },
      ],
    };
    expect(occurrencesOn(MON_W1, data).map((occurrence) => occurrence.ruleId)).toEqual([
      'r-early',
      'r-late',
    ]);
  });
});

describe('occurrencesOn：单双周', () => {
  it('intervalWeeks: 2 的课只在单周出现，双周不出现', () => {
    const oddWeek = occurrencesOn(FRI_W1, makeData());
    expect(oddWeek.map((occurrence) => occurrence.ruleId)).toEqual(['r-art']);

    const evenWeek = occurrencesOn(FRI_W2, makeData());
    expect(evenWeek).toEqual([]);
  });

  it('intervalWeeks: 1 的课双周照常出现', () => {
    expect(occurrencesOn(MON_W2, makeData()).map((occurrence) => occurrence.ruleId)).toEqual([
      'r-math',
    ]);
  });
});

describe('occurrencesOn：学期边界与周模式', () => {
  it('学期外返回空数组', () => {
    expect(occurrencesOn('2026-09-06', makeData())).toEqual([]);
    expect(occurrencesOn('2027-01-25', makeData())).toEqual([]);
  });

  it('节假日当天无课，即使规则本来命中', () => {
    const data = makeData([], [HOLIDAY]);
    // 2026-10-05 是周一，平时有数学
    expect(occurrencesOn('2026-10-05', data)).toEqual([]);
  });

  it('考试周仍返回常规课（P1 不建模考试排期）', () => {
    const exam: WeekPatternRange = { from: MON_W2, to: FRI_W2, pattern: 'exam' };
    expect(occurrencesOn(MON_W2, makeData([], [exam])).map((o) => o.ruleId)).toEqual(['r-math']);
  });
});

describe('occurrencesOn：连堂截断', () => {
  it('span 超出作息表时截断到实际存在的最后一节', () => {
    const data: TimetableData = {
      ...makeData(),
      rules: [
        {
          id: 'r-long',
          courseId: 'c-math',
          byDay: [1],
          intervalWeeks: 1,
          startPeriod: 2,
          span: 10,
        },
      ],
    };
    const occurrences = occurrencesOn(MON_W1, data);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      startPeriod: 2,
      span: 3, // 作息表只剩 2、3、4 节
      startMinute: 8 * 60 + 55,
      endMinute: 11 * 60 + 40,
    });
  });

  it('startPeriod 在作息表里不存在时不产出，避免编造时长', () => {
    const data: TimetableData = {
      ...makeData(),
      rules: [
        { id: 'r-missing', courseId: 'c-math', byDay: [1], intervalWeeks: 1, startPeriod: 9 },
      ],
    };
    expect(occurrencesOn(MON_W1, data)).toEqual([]);
  });
});

describe('occurrencesOn：Override', () => {
  it('cancel：移除该 rule 当天的课，其他日期不受影响', () => {
    const cancel: Override = {
      id: 'o-cancel',
      ruleId: 'r-chinese',
      date: TUE_W1,
      action: 'cancel',
    };
    const data = makeData([cancel]);

    expect(occurrencesOn(TUE_W1, data)).toEqual([]);
    expect(occurrencesOn(TUE_W2, data).map((occurrence) => occurrence.ruleId)).toEqual([
      'r-chinese',
    ]);
  });

  it('move：改节次并重算分钟数，标记 overridden', () => {
    const move: Override = {
      id: 'o-move',
      ruleId: 'r-math',
      date: MON_W1,
      action: 'move',
      payload: { startPeriod: 3, span: 1 },
    };
    const occurrences = occurrencesOn(MON_W1, makeData([move]));
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      key: `r-math@${MON_W1}#3`,
      startPeriod: 3,
      span: 1,
      startMinute: 10 * 60,
      endMinute: 10 * 60 + 45,
      overridden: true,
    });
  });

  it('replace：课还在，courseId 换成替补，时间不变', () => {
    const replace: Override = {
      id: 'o-replace',
      ruleId: 'r-math',
      date: MON_W1,
      action: 'replace',
      payload: { courseId: 'c-art' },
    };
    const occurrences = occurrencesOn(MON_W1, makeData([replace]));
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      courseId: 'c-art',
      startMinute: 8 * 60,
      endMinute: 9 * 60 + 40,
      overridden: true,
    });
  });
});

describe('occurrencesInWeek', () => {
  it('7 天按日期升序拼起来，同一天内按开始时间', () => {
    const occurrences = occurrencesInWeek(MON_W1, makeData());
    expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
      MON_W1,
      TUE_W1,
      WED_W1,
      FRI_W1,
    ]);
    expect(occurrences.map((occurrence) => occurrence.ruleId)).toEqual([
      'r-math',
      'r-chinese',
      'r-math',
      'r-art',
    ]);
  });

  it('只包含 7 天：不会把下一周周一算进来', () => {
    const occurrences = occurrencesInWeek(MON_W1, makeData());
    expect(occurrences.some((occurrence) => occurrence.date === MON_W2)).toBe(false);
  });

  it('整周都在学期外时返回空数组', () => {
    expect(occurrencesInWeek('2026-08-31', makeData())).toEqual([]);
  });
});

describe('纯函数', () => {
  it('不修改入参，重复调用结果一致', () => {
    const data = makeData(
      [
        { id: 'o-cancel', ruleId: 'r-chinese', date: TUE_W1, action: 'cancel' },
        {
          id: 'o-move',
          ruleId: 'r-math',
          date: MON_W1,
          action: 'move',
          payload: { startPeriod: 3 },
        },
        {
          id: 'o-replace',
          ruleId: 'r-math',
          date: WED_W1,
          action: 'replace',
          payload: { courseId: 'c-art' },
        },
      ],
      [HOLIDAY],
    );
    const snapshot = structuredClone(data);

    const first = occurrencesInWeek(MON_W1, data);
    const second = occurrencesInWeek(MON_W1, data);

    expect(first).toEqual(second);
    expect(data).toEqual(snapshot);
  });

  it('返回值与入参不共享引用：改结果不影响数据', () => {
    const data = makeData();
    const snapshot = structuredClone(data);

    const occurrences = occurrencesOn(MON_W1, data);
    for (const occurrence of occurrences) {
      occurrence.startMinute = -1;
    }
    occurrences.pop();

    expect(data).toEqual(snapshot);
  });
});

describe('连堂自动合并', () => {
  const base = {
    date: '2026-03-02',
    courseId: 'c-math',
    ruleId: 'r1',
    startMinute: 480,
    endMinute: 525,
    overridden: false,
  };

  it('同科目、节次相接时合并成一整块', () => {
    const merged = mergeAdjacent([
      { ...base, key: 'a', startPeriod: 1, span: 1, startMinute: 480, endMinute: 525 },
      {
        ...base,
        key: 'b',
        startPeriod: 2,
        span: 1,
        startMinute: 535,
        endMinute: 580,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.span).toBe(2);
    expect(merged[0]?.endMinute).toBe(580);
  });

  it('中间空一节就不合并（课间不是连堂）', () => {
    const merged = mergeAdjacent([
      { ...base, key: 'a', startPeriod: 1, span: 1 },
      { ...base, key: 'b', startPeriod: 3, span: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('不同科目不合并', () => {
    const merged = mergeAdjacent([
      { ...base, key: 'a', startPeriod: 1, span: 1 },
      { ...base, key: 'b', startPeriod: 2, span: 1, courseId: 'c-physics' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('不同日期不合并', () => {
    const merged = mergeAdjacent([
      { ...base, key: 'a', startPeriod: 1, span: 1 },
      { ...base, key: 'b', startPeriod: 2, span: 1, date: '2026-03-03' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('三节连续会合并成 span 3', () => {
    const merged = mergeAdjacent([
      { ...base, key: 'a', startPeriod: 1, span: 1, startMinute: 480, endMinute: 525 },
      { ...base, key: 'b', startPeriod: 2, span: 1, startMinute: 535, endMinute: 580 },
      { ...base, key: 'c', startPeriod: 3, span: 1, startMinute: 590, endMinute: 635 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.span).toBe(3);
    expect(merged[0]?.endMinute).toBe(635);
  });
});
