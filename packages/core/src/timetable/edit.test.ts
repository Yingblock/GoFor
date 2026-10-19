import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIODS } from './draft.ts';
import {
  addCancelOverride,
  addRule,
  addRuleForCell,
  appendPeriod,
  insertPeriodAt,
  movePeriod,
  removePeriodAt,
  removeRule,
  updatePeriodAt,
  validatePeriods,
  validateRules,
} from './edit.ts';
import type { Rule, TimetableData } from './types.ts';

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

describe('课表编辑：插入与移动节次', () => {
  const newPeriod = { start: '18:30', end: '19:15' };

  it('insertPeriodAt(0) 插到头部，编号仍为 1..n 连续', () => {
    const data = insertPeriodAt(empty(), 0, newPeriod);
    expect(data.periods).toHaveLength(5);
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3, 4, 5]);
    expect(data.periods[0]).toEqual({ index: 1, start: '18:30', end: '19:15' });
    // 原来的第 1 节顺延成第 2 节
    expect(data.periods[1]?.start).toBe(DEFAULT_PERIODS[0]?.start);
  });

  it('insertPeriodAt 插到中间，新节落在指定位置', () => {
    const data = insertPeriodAt(empty(), 2, { start: '09:50', end: '10:35' });
    expect(data.periods.map((period) => period.start)).toEqual([
      DEFAULT_PERIODS[0]?.start,
      DEFAULT_PERIODS[1]?.start,
      '09:50',
      DEFAULT_PERIODS[2]?.start,
      DEFAULT_PERIODS[3]?.start,
    ]);
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('insertPeriodAt(length) 等价于追加到末尾', () => {
    const original = empty();
    const data = insertPeriodAt(original, original.periods.length, newPeriod);
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3, 4, 5]);
    expect(data.periods[4]).toEqual({ index: 5, start: '18:30', end: '19:15' });
    expect(data.periods.slice(0, 4)).toEqual(original.periods);
  });

  it('insertPeriodAt 的越界位置被夹到两端', () => {
    const head = insertPeriodAt(empty(), -99, newPeriod);
    expect(head.periods[0]?.start).toBe('18:30');
    const tail = insertPeriodAt(empty(), 99, newPeriod);
    expect(tail.periods[4]?.start).toBe('18:30');
  });

  it('insertPeriodAt 不修改原数据', () => {
    const original = empty();
    insertPeriodAt(original, 1, newPeriod);
    expect(original.periods).toHaveLength(4);
    expect(original.periods.map((period) => period.index)).toEqual([1, 2, 3, 4]);
  });

  it('movePeriod 下移一节：两节交换、编号重排', () => {
    const data = movePeriod(empty(), 0, 1);
    expect(data.periods.map((period) => period.start)).toEqual([
      DEFAULT_PERIODS[1]?.start,
      DEFAULT_PERIODS[0]?.start,
      DEFAULT_PERIODS[2]?.start,
      DEFAULT_PERIODS[3]?.start,
    ]);
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3, 4]);
  });

  it('movePeriod 上移一节：从第 3 节挪到第 1 节', () => {
    const data = movePeriod(empty(), 2, 0);
    expect(data.periods.map((period) => period.start)).toEqual([
      DEFAULT_PERIODS[2]?.start,
      DEFAULT_PERIODS[0]?.start,
      DEFAULT_PERIODS[1]?.start,
      DEFAULT_PERIODS[3]?.start,
    ]);
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3, 4]);
  });

  it('movePeriod 越界或原地不动时原样返回（同一引用）', () => {
    const original = empty();
    expect(movePeriod(original, -1, 0)).toBe(original);
    expect(movePeriod(original, 0, 4)).toBe(original);
    expect(movePeriod(original, 2, -1)).toBe(original);
    expect(movePeriod(original, 2, 2)).toBe(original);
  });

  it('movePeriod 移动后按新顺序重新编号（脏编号也被纠正）', () => {
    const data = movePeriod(
      {
        ...empty(),
        periods: [
          { index: 1, start: '08:00', end: '08:45' },
          { index: 5, start: '08:55', end: '09:40' },
          { index: 9, start: '10:00', end: '10:45' },
        ],
      },
      0,
      2,
    );
    expect(data.periods.map((period) => period.index)).toEqual([1, 2, 3]);
    expect(data.periods.map((period) => period.start)).toEqual(['08:55', '10:00', '08:00']);
  });
});

describe('课表校验：作息表', () => {
  it('合法作息表返回空数组', () => {
    expect(validatePeriods(empty().periods)).toEqual([]);
  });

  it('空作息表也算一条错误', () => {
    expect(validatePeriods([])).toHaveLength(1);
    expect(validatePeriods([])[0]).toContain('至少要有一节');
  });

  it('重复编号报错', () => {
    const errors = validatePeriods([
      { index: 1, start: '08:00', end: '08:45' },
      { index: 1, start: '08:55', end: '09:40' },
      { index: 3, start: '10:00', end: '10:45' },
    ]);
    expect(errors.some((error) => error.includes('重复'))).toBe(true);
    expect(errors.some((error) => error.includes('第 1 节'))).toBe(true);
  });

  it('断号报错：缺少中间那节、编号越界', () => {
    const errors = validatePeriods([
      { index: 1, start: '08:00', end: '08:45' },
      { index: 2, start: '08:55', end: '09:40' },
      { index: 4, start: '10:00', end: '10:45' },
    ]);
    expect(errors.some((error) => error.includes('缺少第 3 节'))).toBe(true);
    expect(errors.some((error) => error.includes('越界'))).toBe(true);
  });

  it('编号从 0 开始也报错', () => {
    const errors = validatePeriods([
      { index: 0, start: '08:00', end: '08:45' },
      { index: 1, start: '08:55', end: '09:40' },
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.includes('越界'))).toBe(true);
  });

  it('start >= end 报错（相等与倒置都算）', () => {
    const errors = validatePeriods([
      { index: 1, start: '10:00', end: '09:00' },
      { index: 2, start: '10:00', end: '10:00' },
    ]);
    expect(errors.filter((error) => error.includes('必须早于'))).toHaveLength(2);
  });

  it('坏时间格式报错，且不再报顺序错', () => {
    const errors = validatePeriods([
      { index: 1, start: '8:00', end: '09:00' },
      { index: 2, start: '08:00', end: '25:00' },
      { index: 3, start: '', end: '08:60' },
    ]);
    expect(errors.some((error) => error.includes('HH:mm'))).toBe(true);
    expect(errors.some((error) => error.includes('必须早于'))).toBe(false);
  });

  it('断号与坏时间可以同时报出', () => {
    const errors = validatePeriods([
      { index: 1, start: '08:00', end: '09:00' },
      { index: 3, start: '9:00', end: '10:00' },
    ]);
    expect(errors.some((error) => error.includes('缺少第 2 节'))).toBe(true);
    expect(errors.some((error) => error.includes('HH:mm'))).toBe(true);
  });
});

describe('课表校验：规则', () => {
  function makeRule(overrides: Partial<Rule> = {}): Rule {
    return {
      id: 'r1',
      courseId: 'c1',
      byDay: [1],
      startPeriod: 1,
      span: 1,
      intervalWeeks: 1,
      ...overrides,
    };
  }

  function withRule(...rules: Rule[]): TimetableData {
    return { ...empty(), rules };
  }

  it('合法规则返回空数组', () => {
    const data = withRule(makeRule({ byDay: [1, 3], startPeriod: 3, span: 2 }));
    expect(validateRules(data)).toEqual([]);
  });

  it('span 省略时按 1 处理', () => {
    const rule = makeRule({ startPeriod: 4 });
    delete rule.span;
    expect(validateRules(withRule(rule))).toEqual([]);
  });

  it('byDay 不在 1–7 报错', () => {
    const errors = validateRules(withRule(makeRule({ byDay: [0, 8] })));
    expect(errors.some((error) => error.includes('星期 0'))).toBe(true);
    expect(errors.some((error) => error.includes('星期 8'))).toBe(true);
  });

  it('byDay 为空报错', () => {
    const errors = validateRules(withRule(makeRule({ byDay: [] })));
    expect(errors.some((error) => error.includes('没有选择星期'))).toBe(true);
  });

  it('startPeriod < 1 报错', () => {
    const errors = validateRules(withRule(makeRule({ startPeriod: 0 })));
    expect(errors.some((error) => error.includes('开始节次必须 ≥ 1'))).toBe(true);
  });

  it('startPeriod + span - 1 超出作息表节数报错', () => {
    const errors = validateRules(withRule(makeRule({ startPeriod: 4, span: 2 })));
    expect(errors.some((error) => error.includes('排到第 5 节'))).toBe(true);
    expect(errors.some((error) => error.includes('超出'))).toBe(true);
  });

  it('span < 1 报错', () => {
    const errors = validateRules(withRule(makeRule({ span: 0 })));
    expect(errors.some((error) => error.includes('连堂节数必须 ≥ 1'))).toBe(true);
  });

  it('intervalWeeks 只能是 1/2', () => {
    const errors = validateRules(
      withRule(makeRule({ intervalWeeks: 3 as unknown as Rule['intervalWeeks'] })),
    );
    expect(errors.some((error) => error.includes('单双周'))).toBe(true);
  });

  it('多条规则的错误带各自序号', () => {
    const errors = validateRules(
      withRule(makeRule({ id: 'r1', byDay: [0] }), makeRule({ id: 'r2', startPeriod: 99 })),
    );
    expect(errors.some((error) => error.startsWith('第 1 条规则'))).toBe(true);
    expect(errors.some((error) => error.startsWith('第 2 条规则'))).toBe(true);
  });
});
