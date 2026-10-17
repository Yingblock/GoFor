import { describe, expect, it } from 'vitest';
import type { StudySession } from '../domain/entities.ts';
import {
  dailyBreakdown,
  dayTotal,
  minutesOf,
  streakDays,
  subjectTotals,
  totalBetween,
} from './aggregate.ts';
import {
  addDays,
  dateToUtcMs,
  daysBetween,
  lastNDays,
  startOfWeek,
  utcMsToDate,
} from './ranges.ts';

let nextId = 1;

/** 构造一条记录：只写当前用例关心的字段，其余给稳定默认值。 */
function session(overrides: Partial<StudySession> = {}): StudySession {
  const id = `s${nextId}`;
  nextId += 1;
  return {
    id,
    date: '2026-03-02',
    start: 0,
    end: 0,
    subjectId: null,
    taskId: null,
    source: 'appTimer',
    createdAt: 0,
    ...overrides,
  };
}

describe('minutesOf：单条时长', () => {
  it('按 end - start 计算分钟', () => {
    expect(minutesOf(session({ start: 540, end: 585 }))).toBe(45);
  });

  it('零长度钳到 0', () => {
    expect(minutesOf(session({ start: 600, end: 600 }))).toBe(0);
  });

  it('负数长度钳到 0，不让脏数据抵减总时长', () => {
    expect(minutesOf(session({ start: 600, end: 540 }))).toBe(0);
  });

  it('跨零点按实际差值算，不截断到 1439', () => {
    // 23:00 → 次日 00:30：start 是当日第 1380 分钟，end 越过 1440 继续累加。
    expect(minutesOf(session({ start: 1380, end: 1470 }))).toBe(90);
  });
});

describe('dayTotal：单日汇总', () => {
  it('只汇总指定日期并统计条数', () => {
    const sessions = [
      session({ date: '2026-03-02', start: 0, end: 30 }),
      session({ date: '2026-03-02', start: 60, end: 90 }),
      session({ date: '2026-03-03', start: 0, end: 50 }),
    ];

    expect(dayTotal(sessions, '2026-03-02')).toEqual({
      date: '2026-03-02',
      minutes: 60,
      sessionCount: 2,
    });
  });

  it('没有记录时返回 0 而不是跳过', () => {
    expect(dayTotal([], '2026-03-02')).toEqual({
      date: '2026-03-02',
      minutes: 0,
      sessionCount: 0,
    });
  });
});

describe('totalBetween：闭区间', () => {
  const sessions = [
    session({ date: '2026-03-01', start: 0, end: 30 }),
    session({ date: '2026-03-02', start: 0, end: 20 }),
    session({ date: '2026-03-03', start: 0, end: 10 }),
  ];

  it('包含 from 与 to 两端', () => {
    expect(totalBetween(sessions, '2026-03-01', '2026-03-03')).toBe(60);
    expect(totalBetween(sessions, '2026-03-01', '2026-03-02')).toBe(50);
    expect(totalBetween(sessions, '2026-03-02', '2026-03-03')).toBe(30);
  });

  it('正好等于边界的那一天也计入', () => {
    expect(totalBetween(sessions, '2026-03-01', '2026-03-01')).toBe(30);
    expect(totalBetween(sessions, '2026-03-03', '2026-03-03')).toBe(10);
  });

  it('区间外的日期不计入', () => {
    expect(totalBetween(sessions, '2026-03-02', '2026-03-02')).toBe(20);
  });

  it('from 晚于 to 时返回 0', () => {
    expect(totalBetween(sessions, '2026-03-03', '2026-03-01')).toBe(0);
  });
});

describe('subjectTotals：科目分布', () => {
  it('按分钟数降序、合并同一科目，null 归为未分类', () => {
    const sessions = [
      session({ start: 0, end: 40, subjectId: 'math' }),
      session({ start: 60, end: 95, subjectId: 'math' }),
      session({ start: 120, end: 210, subjectId: 'english' }),
      session({ start: 240, end: 270, subjectId: null }),
    ];

    expect(subjectTotals(sessions)).toEqual([
      { subjectId: 'english', minutes: 90 },
      { subjectId: 'math', minutes: 75 },
      { subjectId: null, minutes: 30 },
    ]);
  });

  it('分钟数相同时按 id 字典序、未分类最后，保证顺序稳定', () => {
    const sessions = [
      session({ start: 0, end: 30, subjectId: 'b' }),
      session({ start: 0, end: 30, subjectId: 'a' }),
      session({ start: 0, end: 30, subjectId: null }),
    ];

    expect(subjectTotals(sessions)).toEqual([
      { subjectId: 'a', minutes: 30 },
      { subjectId: 'b', minutes: 30 },
      { subjectId: null, minutes: 30 },
    ]);
  });

  it('空输入返回空数组', () => {
    expect(subjectTotals([])).toEqual([]);
  });
});

describe('dailyBreakdown：每日分布', () => {
  it('保留没有记录的日期，顺序与传入 dates 一致', () => {
    const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'];
    const sessions = [
      session({ date: '2026-03-01', start: 0, end: 30, subjectId: 'math' }),
      session({ date: '2026-03-03', start: 0, end: 45, subjectId: 'english' }),
      session({ date: '2026-03-03', start: 60, end: 75, subjectId: null }),
    ];

    expect(dailyBreakdown(sessions, dates)).toEqual([
      {
        date: '2026-03-01',
        totalMinutes: 30,
        bySubject: [{ subjectId: 'math', minutes: 30 }],
      },
      { date: '2026-03-02', totalMinutes: 0, bySubject: [] },
      {
        date: '2026-03-03',
        totalMinutes: 60,
        bySubject: [
          { subjectId: 'english', minutes: 45 },
          { subjectId: null, minutes: 15 },
        ],
      },
      { date: '2026-03-04', totalMinutes: 0, bySubject: [] },
    ]);
  });

  it('按传入顺序输出，不按日期重新排序', () => {
    const sessions = [
      session({ date: '2026-03-01', start: 0, end: 10 }),
      session({ date: '2026-03-03', start: 0, end: 20 }),
    ];

    const result = dailyBreakdown(sessions, ['2026-03-03', '2026-03-01']);

    expect(result.map((day) => day.date)).toEqual(['2026-03-03', '2026-03-01']);
    expect(result.map((day) => day.totalMinutes)).toEqual([20, 10]);
  });

  it('空 dates 返回空数组', () => {
    expect(dailyBreakdown([session({ start: 0, end: 10 })], [])).toEqual([]);
  });
});

describe('streakDays：连续天数', () => {
  it('连续 3 天（含 endDate）返回 3', () => {
    const sessions = [
      session({ date: '2026-03-01' }),
      session({ date: '2026-03-02' }),
      session({ date: '2026-03-03' }),
    ];

    expect(streakDays(sessions, '2026-03-03')).toBe(3);
  });

  it('中间断一天立即停止', () => {
    const sessions = [
      session({ date: '2026-03-01' }),
      session({ date: '2026-03-03' }),
      session({ date: '2026-03-04' }),
    ];

    expect(streakDays(sessions, '2026-03-04')).toBe(2);
  });

  it('当天没有记录返回 0，即使前一天有', () => {
    const sessions = [session({ date: '2026-03-01' }), session({ date: '2026-03-02' })];

    expect(streakDays(sessions, '2026-03-03')).toBe(0);
  });

  it('同一天多条记录只算一天', () => {
    const sessions = [session({ date: '2026-03-03' }), session({ date: '2026-03-03' })];

    expect(streakDays(sessions, '2026-03-03')).toBe(1);
  });

  it('零分钟记录也算打卡（看有无记录，不看时长）', () => {
    const sessions = [session({ date: '2026-03-03', start: 600, end: 600 })];

    expect(streakDays(sessions, '2026-03-03')).toBe(1);
  });

  it('endDate 之后的记录不参与', () => {
    const sessions = [session({ date: '2026-03-02' }), session({ date: '2026-03-04' })];

    expect(streakDays(sessions, '2026-03-03')).toBe(0);
  });

  it('空输入返回 0', () => {
    expect(streakDays([], '2026-03-03')).toBe(0);
  });
});

describe('不可变性', () => {
  it('所有聚合函数都不修改 sessions 与 dates', () => {
    // 冻结后任何原地 sort / push 都会在严格模式下抛错，比只比 JSON 更灵敏。
    const first = Object.freeze(
      session({ date: '2026-03-02', start: 0, end: 30, subjectId: 'math' }),
    );
    const second = Object.freeze(
      session({ date: '2026-03-01', start: 0, end: 45, subjectId: null }),
    );
    const sessions = Object.freeze([first, second]);
    const dates = Object.freeze(['2026-03-02', '2026-03-01']);
    const before = JSON.stringify({ sessions, dates });

    minutesOf(first);
    dayTotal(sessions, '2026-03-02');
    totalBetween(sessions, '2026-03-01', '2026-03-02');
    subjectTotals(sessions);
    dailyBreakdown(sessions, dates);
    streakDays(sessions, '2026-03-02');

    expect(JSON.stringify({ sessions, dates })).toBe(before);
    expect(dates).toEqual(['2026-03-02', '2026-03-01']);
  });
});

describe('ranges：UTC 日期换算', () => {
  it('dateToUtcMs 返回当天 UTC 零点', () => {
    expect(dateToUtcMs('1970-01-01')).toBe(0);
    expect(dateToUtcMs('2026-03-02')).toBe(Date.UTC(2026, 2, 2));
  });

  it('utcMsToDate 与 dateToUtcMs 互为逆运算', () => {
    const dates = ['1970-01-01', '2024-02-29', '2026-12-31', '2028-02-29'];

    for (const date of dates) {
      expect(utcMsToDate(dateToUtcMs(date))).toBe(date);
    }
  });

  it('拒绝格式错误或不存在的日期', () => {
    expect(() => dateToUtcMs('2026-3-2')).toThrow(RangeError);
    expect(() => dateToUtcMs('2026-02-30')).toThrow(RangeError);
    expect(() => utcMsToDate(Number.NaN)).toThrow(RangeError);
  });

  it('addDays 跨月、跨年、闰年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('addDays 加 0 天返回原日期', () => {
    expect(addDays('2026-03-02', 0)).toBe('2026-03-02');
  });

  it('startOfWeek 对周一、周三、周日都返回同一个周一', () => {
    expect(startOfWeek('2026-03-02')).toBe('2026-03-02'); // 周一
    expect(startOfWeek('2026-03-04')).toBe('2026-03-02'); // 周三
    expect(startOfWeek('2026-03-08')).toBe('2026-03-02'); // 周日
  });

  it('startOfWeek 跨月时回到上个月的周一', () => {
    expect(startOfWeek('2026-03-01')).toBe('2026-02-23'); // 周日
  });

  it('lastNDays 返回固定长度且升序', () => {
    expect(lastNDays('2026-03-05', 3)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
    expect(lastNDays('2026-03-05', 1)).toEqual(['2026-03-05']);
  });

  it('lastNDays 跨月跨年仍连续', () => {
    expect(lastNDays('2026-01-01', 2)).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('lastNDays 对 n <= 0 返回空数组', () => {
    expect(lastNDays('2026-03-05', 0)).toEqual([]);
    expect(lastNDays('2026-03-05', -2)).toEqual([]);
  });

  it('daysBetween 按天数差计算', () => {
    expect(daysBetween('2026-03-02', '2026-03-02')).toBe(0);
    expect(daysBetween('2026-03-02', '2026-03-05')).toBe(3);
    expect(daysBetween('2026-03-05', '2026-03-02')).toBe(-3);
  });

  it('daysBetween 跨闰年 2 月正确', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});
