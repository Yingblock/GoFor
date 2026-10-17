/**
 * 课表展开：把「规则 + 覆盖 + 学期 + 作息表」算成某一天/某一周实际发生的课。
 *
 * 设计要点：
 * - **Occurrence 是派生数据，只现算不落库**（ROADMAP §5）。
 *   落库会在每次改规则/调课时留下需要反复对账的脏数据。
 * - **纯函数**：不读 `Date.now()`、不改入参、不依赖本地时区，测试里可以钉死任意日期。
 * - **日期全程用 'YYYY-MM-DD' 字符串**，不引入 dayjs/date-fns：
 *   这里只需要"加 7 天、算星期、算相差几天"，用 UTC 毫秒 20 行就能写完；
 *   少一个依赖，也少一个把时区/DST 偏移带进领域层的入口。
 * - **单双周**只看 `weekOfTerm` 的奇偶：奇数周算单周，`intervalWeeks === 2` 只在单周上课。
 *   不做"按日期算 ISO 周号取模"之类的花样——学期周次才是学生口中的"第几周"。
 * - **exam 周仍返回常规课**：P1 不建模考试排期（ROADMAP 说考试排期是独立实体），
 *   `exam` 目前只是给 UI 的提示标签，课照常上。别在这里偷偷塞考试。
 * - **holiday 周当天直接无课**，且不再看 Override（停课是整天的，调课也没有落点）。
 */

import type { Period } from '../config/schema.ts';
import { parseClockTime } from '../config/time.ts';
import type {
  Occurrence,
  Override,
  Rule,
  Term,
  TimetableData,
  WeekPattern,
  WeekPatternRange,
} from './types.ts';

const MS_PER_DAY = 86_400_000;

/**
 * 解析 'YYYY-MM-DD' 为 UTC 零点毫秒。非法格式/非法日期返回 null。
 *
 * 用 UTC 而不是本地时区：本地时区跨夏令时或东八区以外的机器上，
 * "加一天 = 加 86400000ms"不一定还是日历上的第二天。
 * 回填写回原字符串再做一次比较，顺手挡掉 `2026-02-31` 这类会被 Date 自动进位的日期。
 */
function parseDate(date: string): number | null {
  const parts = date.split('-');
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const utcMs = Date.UTC(year, month - 1, day);
  return formatDate(utcMs) === date ? utcMs : null;
}

/** UTC 毫秒 → 'YYYY-MM-DD'。 */
function formatDate(utcMs: number): string {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 星期几：1=周一 … 7=周日（`Date#getUTCDay` 是 0=周日，需要挪一位）。 */
function dayOfWeek(utcMs: number): number {
  return ((new Date(utcMs).getUTCDay() + 6) % 7) + 1;
}

/**
 * 这一天是学期第几周（1 起）。不在学期内返回 null。
 *
 * 学期外的边界：`startDate` 之前（dayOffset < 0）返回 null；
 * 第 `weeks` 周之后（`week > weeks`）也返回 null。
 * 学期第一周的第一天就是 `startDate` 当天，哪怕它是周二——周次由 `startDate` 定，不由日历周定。
 */
export function weekOfTerm(term: Term, date: string): number | null {
  if (term.weeks < 1) return null;

  const start = parseDate(term.startDate);
  const target = parseDate(date);
  if (start === null || target === null) return null;

  const dayOffset = Math.floor((target - start) / MS_PER_DAY);
  if (dayOffset < 0) return null;

  const week = Math.floor(dayOffset / 7) + 1;
  return week > term.weeks ? null : week;
}

/** 这一天是否单周（第 1、3、5… 周）。学期外不算单周。 */
export function isOddWeek(term: Term, date: string): boolean {
  const week = weekOfTerm(term, date);
  return week !== null && week % 2 === 1;
}

/**
 * 这一天的周模式；未命中任何区间视为 'normal'。
 *
 * 区间两端都包含（from/to 都是"这一天算"）。
 * 多个区间重叠时**后声明的覆盖先声明的**（像 CSS 层叠）：
 * 这样"整个国庆放假"之后还能追加一条只覆盖某一天的 normal 例外，不必回头改大区间。
 */
export function patternOf(date: string, ranges: WeekPatternRange[]): WeekPattern {
  const target = parseDate(date);
  if (target === null) return 'normal';

  let pattern: WeekPattern = 'normal';
  for (const range of ranges) {
    const from = parseDate(range.from);
    const to = parseDate(range.to);
    if (from === null || to === null) continue;
    if (target >= from && target <= to) pattern = range.pattern;
  }
  return pattern;
}

/** 一条规则在应用 Override 之后的状态。 */
interface ResolvedRule {
  courseId: string;
  startPeriod: number;
  span: number;
  overridden: boolean;
  cancelled: boolean;
}

/**
 * 把当天命中的 Override 依次套到规则上。
 *
 * 语义（按 `overrides` 数组顺序，后声明的覆盖先声明的）：
 * - `cancel`：整条移除，且是**终态**——后面再有 move/replace 也不复活；
 * - `move`：改 `startPeriod` / `span`，缺省字段保持原值；
 * - `replace`：只换 `courseId`（课还在，内容变了），不动时间；
 * - 三种都置 `overridden = true`，UI 据此打"已调整"标记。
 *
 * Override 只调整"规则本来就会产生的那条课"，不会凭空造课：
 * 若要给别的日子加课，应该新增一条 Rule。
 */
function resolveRule(rule: Rule, date: string, overrides: Override[]): ResolvedRule {
  const state: ResolvedRule = {
    courseId: rule.courseId,
    startPeriod: rule.startPeriod,
    span: Math.max(1, rule.span ?? 1),
    overridden: false,
    cancelled: false,
  };

  for (const override of overrides) {
    if (override.ruleId !== rule.id || override.date !== date) continue;

    if (override.action === 'cancel') {
      state.cancelled = true;
      state.overridden = true;
      break;
    }

    state.overridden = true;

    if (override.action === 'move') {
      const { startPeriod, span } = override.payload ?? {};
      if (startPeriod !== undefined) state.startPeriod = startPeriod;
      if (span !== undefined) state.span = Math.max(1, span);
      continue;
    }

    // action === 'replace'
    const courseId = override.payload?.courseId;
    if (courseId !== undefined) state.courseId = courseId;
  }

  return state;
}

/** 连堂解析结果。`span` 是**实际**占用的节数（可能因作息表不够长而截断）。 */
interface SpanResolution {
  startMinute: number;
  endMinute: number;
  span: number;
}

/** 把 Period 按 index 索引一次，避免每条规则都重扫作息表。 */
function indexPeriods(periods: Period[]): Map<number, Period> {
  const byIndex = new Map<number, Period>();
  for (const period of periods) byIndex.set(period.index, period);
  return byIndex;
}

/**
 * 连堂：`span` 个连续 Period 合并成一条，分钟数取首尾。
 *
 * 截断规则：从 `startPeriod` 往后逐节找，遇到作息表里没有的 index 就停
 * （既覆盖"超出作息表末尾"，也覆盖"index 中间有缺口"的脏数据）。
 * `startPeriod` 本身不存在时返回 null——算不出分钟数的课宁可不显示，
 * 也不要用一个编造的时长污染统计。
 */
function resolveSpan(
  periods: Map<number, Period>,
  startPeriod: number,
  requestedSpan: number,
): SpanResolution | null {
  const first = periods.get(startPeriod);
  if (first === undefined) return null;

  let last = first;
  let actualSpan = 1;
  for (let offset = 1; offset < requestedSpan; offset += 1) {
    const next = periods.get(startPeriod + offset);
    if (next === undefined) break;
    last = next;
    actualSpan += 1;
  }

  return {
    startMinute: parseClockTime(first.start),
    endMinute: parseClockTime(last.end),
    span: actualSpan,
  };
}

/** 按开始分钟升序；同分钟时按节次、key 兜底，保证输出顺序确定。 */
function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  if (a.startPeriod !== b.startPeriod) return a.startPeriod - b.startPeriod;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * 某一天的全部课，按开始时间升序。
 *
 * 处理顺序（顺序本身有语义）：
 * 1. `weekOfTerm` 为 null（学期外 / 日期非法）→ 空数组，后面一概不算；
 * 2. 周模式为 holiday → 空数组（整天停课，Override 也不再生效）；
 * 3. 逐条规则过滤 `byDay`；`intervalWeeks === 2` 再过滤单周；
 * 4. 套当天该规则的 Override（cancel/move/replace）；
 * 5. 把 `startPeriod + span` 落到作息表上，得到分钟数与实际节数；
 * 6. 汇总后按 `startMinute` 排序。
 *
 * exam 周不特殊处理：照常返回常规课，见文件头注释。
 */
export function occurrencesOn(date: string, data: TimetableData): Occurrence[] {
  const week = weekOfTerm(data.term, date);
  if (week === null) return [];

  if (patternOf(date, data.weekPatterns) === 'holiday') return [];

  // weekOfTerm 已校验过日期，这里只是把 string 换成毫秒并让类型收窄。
  const dateMs = parseDate(date);
  if (dateMs === null) return [];

  const weekday = dayOfWeek(dateMs);
  const isOdd = week % 2 === 1;
  const periods = indexPeriods(data.periods);
  const result: Occurrence[] = [];

  for (const rule of data.rules) {
    if (!rule.byDay.includes(weekday)) continue;
    // 单双周：只有单周上。偶数周（双周）直接跳过。
    if (rule.intervalWeeks === 2 && !isOdd) continue;

    const resolved = resolveRule(rule, date, data.overrides);
    if (resolved.cancelled) continue;

    const span = resolveSpan(periods, resolved.startPeriod, resolved.span);
    if (span === null) continue;

    result.push({
      key: `${rule.id}@${date}#${resolved.startPeriod}`,
      date,
      courseId: resolved.courseId,
      ruleId: rule.id,
      startPeriod: resolved.startPeriod,
      span: span.span,
      startMinute: span.startMinute,
      endMinute: span.endMinute,
      overridden: resolved.overridden,
    });
  }

  return result.sort(compareOccurrences);
}

/**
 * 某一周（从 `weekStartDate` 起的 7 天）的全部课，按日期升序。
 *
 * 不校验 `weekStartDate` 是不是周一：调用方可能从"今天"开始看一周，
 * 硬性要求周一只会把边界处理推给 UI。日期非法时返回空数组。
 *
 * 每天内部已按开始分钟排序，按日期顺序拼起来即为"日期升序、同日按时间"。
 */
export function occurrencesInWeek(weekStartDate: string, data: TimetableData): Occurrence[] {
  const start = parseDate(weekStartDate);
  if (start === null) return [];

  const result: Occurrence[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = formatDate(start + offset * MS_PER_DAY);
    result.push(...occurrencesOn(date, data));
  }
  return result;
}

/**
 * 把同一天、同一门课、节次相接的课合并成一条。
 *
 * 为什么放在 core 而不是视图层：连堂是"课表语义"，不是渲染细节。
 * 用户用两条独立规则排出第 2、3 节数学，看起来应该是**一整块**连堂，
 * 否则周视图里会碎成两个方块，而且 span 也没法跨行。
 *
 * 只合并 startPeriod 严格相接的（`prev.start + prev.span === next.start`），
 * 中间有空节就不合并——那是课间，不是连堂。
 */
export function mergeAdjacent(occurrences: readonly Occurrence[]): Occurrence[] {
  const sorted = [...occurrences].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startPeriod - b.startPeriod ||
      a.courseId.localeCompare(b.courseId),
  );

  const merged: Occurrence[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    const canMerge =
      last !== undefined &&
      last.date === current.date &&
      last.courseId === current.courseId &&
      last.startPeriod + last.span === current.startPeriod;

    if (canMerge && last) {
      merged[merged.length - 1] = {
        ...last,
        span: last.span + current.span,
        endMinute: current.endMinute,
        overridden: last.overridden || current.overridden,
      };
    } else {
      merged.push(current);
    }
  }
  return merged;
}
