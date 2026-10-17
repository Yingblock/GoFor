/**
 * 课表数据模型（纯类型，零 UI、零平台 API）。
 *
 * 模型照抄 iCalendar 的 RRULE 思想（ROADMAP §5）：
 * 一条 `Rule` 描述"每周几、第几节、单双周"，`Override` 只记录个别日期的调整，
 * **`Occurrence` 是算出来的派生数据，不落库**。
 *
 * 为什么不落库：落库后每次改规则、加调课都要回头批量修历史数据，
 * 脏数据会越滚越多；而一个学期的课表只有几百条，现算的代价可以忽略。
 *
 * 作息表直接复用 `config/schema.ts` 的 `Period`：
 * 用户在这里改不了"一节课多少分钟"，只能改作息表，避免两处定义漂移。
 */

import type { Period } from '../config/schema.ts';

/** 学期。 */
export interface Term {
  id: string;
  /** 学期第一周的周一，'YYYY-MM-DD'。用于推算单双周。 */
  startDate: string;
  /** 学期周数；第 `weeks` 周之后一律视为不在学期内。 */
  weeks: number;
}

/** 课程（科目）。 */
export interface Course {
  id: string;
  name: string;
  teacher?: string;
  location?: string;
  color?: string;
}

/** 一条排课规则。相当于 `FREQ=WEEKLY;BYDAY=...;INTERVAL=...`。 */
export interface Rule {
  id: string;
  courseId: string;
  /** 星期几：1=周一 … 7=周日。一门课可能有多个。 */
  byDay: number[];
  /** 1=每周，2=单双周（配合 Term.startDate 推算奇偶）。 */
  intervalWeeks: 1 | 2;
  /** 从第几节课开始（对应 Period.index）。 */
  startPeriod: number;
  /** 连堂：占几个 Period。默认 1。 */
  span?: number;
  /** 走班组别；为空表示全班。P1 只存不用。 */
  group?: string;
}

export type OverrideAction = 'cancel' | 'move' | 'replace';

/**
 * 对某一条规则的某一天做局部调整（调课/停课/代课）。
 *
 * 注意：`move` 只改当天的节次，不改日期——"周三的课挪到周五"要表达成
 * 两条 Override（周三 cancel + 周五的规则上 move），而不是一条跨日 Override。
 * 这样每条 Override 始终只依赖一条 Rule，展开逻辑不需要跨规则推导。
 */
export interface Override {
  id: string;
  ruleId: string;
  /** 被调整的那一天。 */
  date: string;
  action: OverrideAction;
  /** action='move' 时的目标节次；action='replace' 时的替补课程 id。 */
  payload?: { startPeriod?: number; span?: number; courseId?: string };
}

export type WeekPattern = 'normal' | 'exam' | 'holiday';

/** 日期区间 → 周模式。用于节假日、考试周等特殊周。 */
export interface WeekPatternRange {
  from: string;
  to: string;
  pattern: WeekPattern;
}

/** 课表全量数据：一份不可变快照，展开函数只读它。 */
export interface TimetableData {
  term: Term;
  courses: Course[];
  rules: Rule[];
  overrides: Override[];
  periods: Period[];
  weekPatterns: WeekPatternRange[];
}

/** 某一天实际发生的一节课。 */
export interface Occurrence {
  /** 稳定键，用于 UI 列表 key 与去重：`${ruleId}@${date}#${startPeriod}`。 */
  key: string;
  date: string;
  courseId: string;
  ruleId: string;
  startPeriod: number;
  span: number;
  /** 当日第几分钟（来自 Period），便于直接喂给统计。 */
  startMinute: number;
  endMinute: number;
  /** 是否被 Override 改动过。 */
  overridden: boolean;
}
