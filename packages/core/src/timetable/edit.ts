/**
 * 课表的编辑操作（纯函数）：改数据，不碰存储、不生成 id。
 *
 * id 由宿主用 `newId()` 生成后传进来——core 不碰随机数，这是仓库的老规矩。
 * 之所以把这些"加一条规则""删一节"单独抽出来，是因为它们是**不可撤销的写操作**：
 * 删错一条规则就是丢一节课，必须能单测；而它们原来只是一段内联在 JSX 里的对象展开。
 */

import type { Period } from '../config/schema.ts';
import type { Rule, TimetableData } from './types.ts';

/** 新规则的最小输入：id 由调用方生成。 */
export interface NewRuleInput {
  id: string;
  courseId: string;
  byDay: number[];
  startPeriod: number;
  span?: number;
  intervalWeeks?: 1 | 2;
}

/** 追加一条规则（不校验冲突：冲突由 `occupiedCellKeys` 在编辑模式里挡）。 */
export function addRule(data: TimetableData, input: NewRuleInput): TimetableData {
  const rule: Rule = {
    id: input.id,
    courseId: input.courseId,
    byDay: input.byDay,
    startPeriod: input.startPeriod,
    span: input.span ?? 1,
    intervalWeeks: input.intervalWeeks ?? 1,
  };
  return { ...data, rules: [...data.rules, rule] };
}

/**
 * 按 id 删规则。
 *
 * 注意连堂的取舍：合并块只记着第一条规则的 id，所以删"这一节"只删第一条，
 * 剩下的半截会变回单独的块。宁可少删，也不要多删——多删不可撤销。
 */
export function removeRule(data: TimetableData, ruleId: string): TimetableData {
  return { ...data, rules: data.rules.filter((rule) => rule.id !== ruleId) };
}

/** 给某条规则加一个"停课一次"的覆盖。 */
export function addCancelOverride(
  data: TimetableData,
  input: { id: string; ruleId: string; date: string },
): TimetableData {
  return {
    ...data,
    overrides: [
      ...data.overrides,
      { id: input.id, ruleId: input.ruleId, date: input.date, action: 'cancel' },
    ],
  };
}

/**
 * 编辑模式下"点空格子加一节课"：只排被点的那一天那一节。
 *
 * 想连排几天就多点几个格子，比让用户回到上面填"星期几 / 第几节"直观。
 * span 固定 1：连堂要靠用户自己把相邻节排满（或在上面的规则表单里设 span）。
 */
export function addRuleForCell(
  data: TimetableData,
  input: { id: string; courseId: string; day: number; periodIndex: number },
): TimetableData {
  return addRule(data, {
    id: input.id,
    courseId: input.courseId,
    byDay: [input.day],
    startPeriod: input.periodIndex,
    span: 1,
    intervalWeeks: 1,
  });
}

/** 改某一节的起止时间；索引越界时原样返回。 */
export function updatePeriodAt(
  data: TimetableData,
  position: number,
  patch: Partial<Pick<Period, 'start' | 'end'>>,
): TimetableData {
  if (position < 0 || position >= data.periods.length) return data;
  return {
    ...data,
    periods: data.periods.map((period, index) =>
      index === position ? { ...period, ...patch } : period,
    ),
  };
}

/** 删掉某一节，并把后面各节的 `index` 重新编号（从 1 连续）。 */
export function removePeriodAt(data: TimetableData, position: number): TimetableData {
  if (position < 0 || position >= data.periods.length) return data;
  return {
    ...data,
    periods: data.periods
      .filter((_, index) => index !== position)
      .map((period, index) => ({ ...period, index: index + 1 })),
  };
}

/** 在末尾追加一节：编号接在现有节数之后。 */
export function appendPeriod(data: TimetableData, period: Omit<Period, 'index'>): TimetableData {
  return {
    ...data,
    periods: [...data.periods, { index: data.periods.length + 1, ...period }],
  };
}
