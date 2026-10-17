/**
 * 日期区间工具（纯函数，零依赖）。
 *
 * 为什么不复用 `domain/entities.ts` 的 `dateKey()`：那个走本地时区、依赖 `Clock`，
 * 回答的是"现在算哪一天"；统计要的是对日历键做纯算术，必须与运行环境时区无关。
 * 否则同一份学习记录在 UTC+8 和 UTC-8 的设备上会算出不同的"本周"和"连续天数"。
 *
 * 所以所有换算一律走 `Date.UTC` / `getUTC*`，绝不使用 `new Date(y, m, d)`
 * 这类按本地时区解释的构造方式。
 */

/** 一天的毫秒数。日期键是日历日，UTC 没有夏令时，所以可以直接乘加。 */
const MS_PER_DAY = 86_400_000;

/** 严格匹配 `YYYY-MM-DD`（不接受 `2026-3-2` 这种写法，避免字符串比较失效）。 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function parseDate(date: string): { year: number; month: number; day: number } {
  if (!DATE_PATTERN.test(date)) {
    throw new RangeError(`日期必须是 YYYY-MM-DD：${date}`);
  }
  // 正则已保证长度与分隔符，slice 不会越界；这样写也避开了下标访问的 undefined。
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** 'YYYY-MM-DD' → UTC 毫秒（当天 00:00）。 */
export function dateToUtcMs(date: string): number {
  const { year, month, day } = parseDate(date);
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC 会把 2026-02-30 静默滚到 3 月 2 日。回环校验把非法日期挡在这里，
  // 免得一次脏输入让统计里凭空多出一天、把 streak 算长。
  if (utcMsToDate(ms) !== date) {
    throw new RangeError(`不存在的日期：${date}`);
  }
  return ms;
}

/** UTC 毫秒 → 'YYYY-MM-DD'。 */
export function utcMsToDate(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`毫秒必须是有限数：${ms}`);
  }
  // 用 getUTC* 而不是 getFullYear 等：入参可能来自任意时区，只看 UTC 日历。
  const value = new Date(ms);
  const year = pad(value.getUTCFullYear(), 4);
  const month = pad(value.getUTCMonth() + 1, 2);
  const day = pad(value.getUTCDate(), 2);
  return `${year}-${month}-${day}`;
}

/** 在 date 基础上加减天数，返回 'YYYY-MM-DD'。 */
export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * MS_PER_DAY);
}

/** 这一周的周一（周一为一周之首）。 */
export function startOfWeek(date: string): string {
  const ms = dateToUtcMs(date);
  // getUTCDay：0 = 周日，1 = 周一 … 6 = 周六。
  // +6 再取模把"周一"映射到 0，周末（周日）才会落在 6 而不是 -1。
  const offset = (new Date(ms).getUTCDay() + 6) % 7;
  return utcMsToDate(ms - offset * MS_PER_DAY);
}

/** 最近 n 天（含 endDate），升序。 */
export function lastNDays(endDate: string, n: number): string[] {
  const count = Math.max(0, Math.floor(n));
  const dates: string[] = [];
  // 从最早的一天往后推，天然得到升序；n <= 0 时循环不执行，返回空数组。
  for (let i = count - 1; i >= 0; i -= 1) {
    dates.push(addDays(endDate, -i));
  }
  return dates;
}

/** 两个日期之间的天数（b - a）。 */
export function daysBetween(a: string, b: string): number {
  // 两端都是 UTC 零点，差值一定是整天的倍数；round 只是防浮点除法留下尾差。
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / MS_PER_DAY);
}
