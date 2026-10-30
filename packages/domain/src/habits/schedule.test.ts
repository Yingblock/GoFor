import { describe, expect, it } from 'vitest';
import {
  addDays,
  type Habit,
  habitDatesBetween,
  isHabitActiveOn,
  isHabitCheckableOn,
  isoWeekday,
} from './schedule.js';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '背单词',
    weekdays: [],
    startDate: '2026-03-01',
    endDate: null,
    order: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe('打卡排期', () => {
  it('星期换算：周一到周日', () => {
    expect(isoWeekday('2026-03-02')).toBe(1); // 周一
    expect(isoWeekday('2026-03-08')).toBe(7); // 周日
  });

  it('空 weekdays 表示每天，但要受起止日期约束', () => {
    const h = habit({ endDate: '2026-03-05' });
    expect(isHabitActiveOn(h, '2026-02-28')).toBe(false);
    expect(isHabitActiveOn(h, '2026-03-01')).toBe(true);
    expect(isHabitActiveOn(h, '2026-03-05')).toBe(true);
    expect(isHabitActiveOn(h, '2026-03-06')).toBe(false);
  });

  it('只在指定星期生效', () => {
    const h = habit({ weekdays: [1, 3, 5] });
    expect(isHabitActiveOn(h, '2026-03-02')).toBe(true); // 周一
    expect(isHabitActiveOn(h, '2026-03-03')).toBe(false); // 周二
    expect(isHabitActiveOn(h, '2026-03-04')).toBe(true); // 周三
  });

  it('区间内只返回命中的日期，升序', () => {
    const h = habit({ weekdays: [1], endDate: '2026-03-31' });
    expect(habitDatesBetween(h, '2026-03-01', '2026-03-20')).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
    ]);
  });

  it('未来不可打卡，今天和过去可以', () => {
    const h = habit();
    expect(isHabitCheckableOn(h, '2026-03-10', '2026-03-08')).toBe(false);
    expect(isHabitCheckableOn(h, '2026-03-08', '2026-03-08')).toBe(true);
    expect(isHabitCheckableOn(h, '2026-03-01', '2026-03-08')).toBe(true);
  });

  it('addDays 跨月跨年', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
