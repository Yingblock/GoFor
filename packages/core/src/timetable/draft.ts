/**
 * 课表的"草稿"层：默认数据、解析、日期工具。
 *
 * 这些东西原来散在 `apps/web/src/screens/Timetable.tsx` 里。搬进 core 的理由很简单：
 * "库里那份数据能不能用"和"这一周从哪天算起"都是纯逻辑，但躺在组件里就只能手点验证。
 * 组件现在只负责渲染与交互，读盘防御与日期推导都在这里。
 */

import type { Period } from '../config/schema.ts';
import type { Term, TimetableData } from './types.ts';

/** 周一 … 周日。列序 + 1 就是 `Rule.byDay` 里的星期几。 */
export const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

/**
 * 用户还没填作息表时的默认节次。
 *
 * 为什么放 core 而不是配置：配置里管的是"一节课多少分钟"这种可由作息表推导的量，
 * 而这份默认表是"新建课表时长什么样"的产品决定，用户一旦保存就被真实作息覆盖。
 */
export const DEFAULT_PERIODS: readonly Period[] = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:55', end: '11:40' },
  { index: 5, start: '14:00', end: '14:45' },
  { index: 6, start: '14:55', end: '15:40' },
  { index: 7, start: '16:00', end: '16:45' },
  { index: 8, start: '16:55', end: '17:40' },
];

/** 默认学期长度（周）。一个学期 20 周是常态，用户可改。 */
export const DEFAULT_TERM_WEEKS = 20;

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' 加减天数。走 UTC，避免夏令时/时区把日期推歪。 */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** 给定日期所在那一周的周一。周日算上一周的周一（周视图以周一为第一天）。 */
export function mondayOf(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const weekday = base.getUTCDay(); // 0=周日
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

/** 从周一开始的 7 个日期，按列序返回（列 0 = 周一）。 */
export function weekDatesOf(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * 新建课表的初始数据。
 *
 * `courses` 是历史字段：科目已经统一走 Dexie 的 `subjects` 表，
 * 这里留空数组只是为了兼容 `TimetableData` 的形状，页面不读也不写它。
 */
export function defaultTimetable(termId: string, today: string): TimetableData {
  const term: Term = { id: termId, startDate: mondayOf(today), weeks: DEFAULT_TERM_WEEKS };
  return {
    term,
    courses: [],
    rules: [],
    overrides: [],
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    weekPatterns: [],
  };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 把库里读到的 `unknown` 收窄成课表数据；形状不对返回 null（调用方回退到默认数据）。
 *
 * 两条刻意的宽容：
 * - `courses` / `weekPatterns` / `overrides` / `rules` **缺了就补空**，不整份判废。
 *   早期版本的数据没有 `courses` / `weekPatterns`，严格校验会把用户真实课表判成坏数据，
 *   表现就是"课表读不出来、打印留空"。
 * - 只校验能真正把渲染搞崩的字段：`periods` 必须非空（没有节次就没有行），
 *   `term.startDate` 必须是日期、`term.weeks` 必须是正数（单双周推算要用）。
 */
export function parseTimetable(raw: unknown): TimetableData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<TimetableData>;
  if (!Array.isArray(candidate.periods) || candidate.periods.length === 0) return null;

  const term = candidate.term;
  if (typeof term !== 'object' || term === null) return null;
  if (typeof term.startDate !== 'string' || !DATE_KEY.test(term.startDate)) return null;
  if (typeof term.weeks !== 'number' || !Number.isFinite(term.weeks) || term.weeks < 1) return null;

  return {
    term,
    periods: candidate.periods,
    courses: Array.isArray(candidate.courses) ? candidate.courses : [],
    rules: Array.isArray(candidate.rules) ? candidate.rules : [],
    overrides: Array.isArray(candidate.overrides) ? candidate.overrides : [],
    weekPatterns: Array.isArray(candidate.weekPatterns) ? candidate.weekPatterns : [],
  } as TimetableData;
}
