/**
 * `@gofor/core/stats` 子模块入口。
 *
 * 统计只依赖 `domain` 的实体与纯日期算术，没有 zod、没有平台 API，
 * 宿主可以放心引用；子路径导出由 package.json 统一添加（本任务不改）。
 */

export {
  type DayBreakdown,
  type DayTotal,
  dailyBreakdown,
  dayTotal,
  minutesOf,
  streakDays,
  type SubjectTotal,
  subjectTotals,
  totalBetween,
} from './aggregate.ts';
export {
  addDays,
  dateToUtcMs,
  daysBetween,
  lastNDays,
  startOfWeek,
  utcMsToDate,
} from './ranges.ts';
