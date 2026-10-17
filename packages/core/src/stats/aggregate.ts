/**
 * 学习统计（纯函数，零 UI、零平台 API、零副作用）。
 *
 * 所有结果都从 `StudySession` 现算，不落库、不缓存：数据量是一天几条到几十条，
 * 重算远比维护一份可能过期的聚合表便宜，也避免了"删了记录统计没更新"这类 bug。
 *
 * 约定：
 * - 入参一律 `readonly`，函数内部只读、不排序入参（排序发生在新建的结果数组上）。
 * - 不读 `Date.now()`：统计的"今天"由调用方传入，测试里才能钉死。
 * - 日期按固定宽度 `YYYY-MM-DD` 字符串比较，等价于时间先后。
 */

import type { StudySession } from '../domain/entities.ts';
import { addDays } from './ranges.ts';

/** 一天的总时长（分钟）。 */
export interface DayTotal {
  date: string;
  minutes: number;
  sessionCount: number;
}

/** 某个科目的时长。 */
export interface SubjectTotal {
  subjectId: string | null;
  minutes: number;
}

/** 一天的科目分布。 */
export interface DayBreakdown {
  date: string;
  totalMinutes: number;
  bySubject: SubjectTotal[];
}

/**
 * 一条记录的时长（分钟）。
 *
 * 跨零点的记录（如 23:00–00:30 记成 start=1380, end=1470）存的是"当日第几分钟"，
 * 所以差值本身已经正确；这里只做钳制，不把 end 截到 1439——
 * 一旦截断，跨零点的时间会被算成 59 分钟而不是 90 分钟。
 * 负数与零长度（录错误或未来数据）统一记 0，不让脏数据抵减总时长。
 */
export function minutesOf(session: StudySession): number {
  return Math.max(0, session.end - session.start);
}

/** 一天的总时长（分钟）。 */
export function dayTotal(sessions: readonly StudySession[], date: string): DayTotal {
  let minutes = 0;
  let sessionCount = 0;
  for (const session of sessions) {
    if (session.date !== date) continue;
    minutes += minutesOf(session);
    sessionCount += 1;
  }
  return { date, minutes, sessionCount };
}

/** `[from, to]` 闭区间内的总时长（分钟）。 */
export function totalBetween(
  sessions: readonly StudySession[],
  from: string,
  to: string,
): number {
  let minutes = 0;
  for (const session of sessions) {
    // 固定宽度的日期键可以直接比字符串；闭区间意味着两端都算。
    if (session.date >= from && session.date <= to) {
      minutes += minutesOf(session);
    }
  }
  return minutes;
}

/** 科目 id 的稳定排序：字典序，未分类（null）排最后。 */
function compareSubjectId(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

/**
 * 各科目时长，按分钟数降序。
 *
 * `subjectId === null` 表示没归类（用户跳过了科目选择），单独成一组，
 * 不能丢掉——否则各科目时长之和会小于一天的总时长，对不上账。
 *
 * 分钟数相同时按 id 字典序、null 最后，保证结果稳定：
 * 否则每次渲染顺序可能不同，UI 会抖，测试也没法断言。
 */
export function subjectTotals(sessions: readonly StudySession[]): SubjectTotal[] {
  const totals = new Map<string | null, number>();
  for (const session of sessions) {
    totals.set(session.subjectId, (totals.get(session.subjectId) ?? 0) + minutesOf(session));
  }
  return [...totals.entries()]
    .map(([subjectId, minutes]) => ({ subjectId, minutes }))
    .sort((left, right) => {
      if (right.minutes !== left.minutes) return right.minutes - left.minutes;
      return compareSubjectId(left.subjectId, right.subjectId);
    });
}

/**
 * 按给定日期顺序输出每日分布。
 *
 * 必须保留没有记录的日期（0 分钟），不能跳过：调用方拿到的一定是和 `dates`
 * 等长、同序的数组，画柱状图时才能把空白日也摆在时间轴上。
 */
export function dailyBreakdown(
  sessions: readonly StudySession[],
  dates: readonly string[],
): DayBreakdown[] {
  // 先按日期分桶，避免对每个日期都把全部记录扫一遍（dates 常见是 7–30 天）。
  const byDate = new Map<string, StudySession[]>();
  for (const session of sessions) {
    const bucket = byDate.get(session.date);
    if (bucket === undefined) {
      byDate.set(session.date, [session]);
    } else {
      bucket.push(session);
    }
  }
  return dates.map((date) => {
    const bySubject = subjectTotals(byDate.get(date) ?? []);
    const totalMinutes = bySubject.reduce((sum, subject) => sum + subject.minutes, 0);
    return { date, totalMinutes, bySubject };
  });
}

/**
 * 连续有记录的天数（从 endDate 往回数，遇到空白天中断）。
 *
 * 判定口径是"当天有没有记录"，不是"当天时长 > 0"：涂了一格但解析出 0 分钟
 * 也算打过卡，不然用户会看到自己明明记了却断签。
 *
 * 只看 endDate 及更早：未来的记录（补录/时区问题）不参与，也不让 streak 变长。
 */
export function streakDays(sessions: readonly StudySession[], endDate: string): number {
  const recorded = new Set<string>();
  for (const session of sessions) {
    recorded.add(session.date);
  }
  let days = 0;
  let cursor = endDate;
  // 集合有限，每天往回退一定终止；当天没记录时循环一次都不进，返回 0。
  while (recorded.has(cursor)) {
    days += 1;
    cursor = addDays(cursor, -1);
  }
  return days;
}
