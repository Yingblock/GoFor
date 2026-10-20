/**
 * 课表的编辑操作（纯函数）：改数据，不碰存储、不生成 id。
 *
 * id 由宿主用 `newId()` 生成后传进来——core 不碰随机数，这是仓库的老规矩。
 * 之所以把这些"加一条规则""删一节"单独抽出来，是因为它们是**不可撤销的写操作**：
 * 删错一条规则就是丢一节课，必须能单测；而它们原来只是一段内联在 JSX 里的对象展开。
 */

import type { Period } from '../config/schema.ts';
import { occurrencesOn } from './occurrences.ts';
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

/** 换课要定位的那一块：哪一天、从第几节起、占几节、换成哪门课。 */
export interface ReplaceCourseInput {
  /** 被点的那一块所在的日期（'YYYY-MM-DD'）。 */
  date: string;
  /** 块的起始节次。 */
  startPeriod: number;
  /** 块占的节数：连堂合并后可能大于 1。 */
  span: number;
  /** 新的科目 id。 */
  courseId: string;
}

/**
 * 把某一天的某一节课换成另一门课：只改科目，不动时间与节次。
 *
 * 换的是**产生这一块的规则**，不是这一天的临时调整——这和编辑模式里"点课块删除"
 * 的粒度一致（那条规则排的其它天会一起变），用户在浮层里能看到同样的说明。
 * 之所以用 `occurrencesOn` 而不是直接按 `byDay`/`startPeriod` 匹配规则：
 * 连堂块可能是多条规则拼出来的，也可能被当天的 Override 挪过位置，
 * 只有先展开再按节次范围圈定，才能把这一块背后的规则全部找齐。
 *
 * 当天若有 `action='replace'` 的代课覆盖，会一并删掉：否则规则换了科目，
 * 那天的覆盖还会把显示改回旧课，等于点了没反应。
 *
 * 没有匹配到任何规则、或这一块已经是目标课程时，返回同一个引用（调用方据此跳过保存）。
 */
export function replaceCourseForBlock(
  data: TimetableData,
  input: ReplaceCourseInput,
): TimetableData {
  const endPeriod = input.startPeriod + Math.max(1, input.span) - 1;
  const covered = occurrencesOn(input.date, data).filter(
    (occurrence) =>
      occurrence.startPeriod >= input.startPeriod &&
      occurrence.startPeriod + occurrence.span - 1 <= endPeriod,
  );
  const ruleIds = new Set(covered.map((occurrence) => occurrence.ruleId));
  if (ruleIds.size === 0) return data;
  if (covered.every((occurrence) => occurrence.courseId === input.courseId)) return data;

  return {
    ...data,
    rules: data.rules.map((rule) =>
      ruleIds.has(rule.id) ? { ...rule, courseId: input.courseId } : rule,
    ),
    overrides: data.overrides.filter(
      (override) =>
        !(
          ruleIds.has(override.ruleId) &&
          override.date === input.date &&
          override.action === 'replace'
        ),
    ),
  };
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

/**
 * 在指定位置插入一节，并把所有节次重新编号（从 1 连续）。
 *
 * `position` 是在**插入前**数组里的下标：0 = 插到最前面，
 * `data.periods.length` = 插到最后面（等价于 `appendPeriod`）。
 * 越界时夹到两端而不是原样返回——UI 的"在下方插入"永远传合法值，
 * 但夹一下能让"插到头部/尾部"这种调用不必各自做边界判断。
 */
export function insertPeriodAt(
  data: TimetableData,
  position: number,
  period: Omit<Period, 'index'>,
): TimetableData {
  const at = Math.max(0, Math.min(Math.trunc(position) || 0, data.periods.length));
  const periods = [...data.periods];
  periods.splice(at, 0, { index: at + 1, ...period });
  return {
    ...data,
    periods: periods.map((item, index) => ({ ...item, index: index + 1 })),
  };
}

/**
 * 把某一节从 `from` 挪到 `to`，移动后重新编号。
 *
 * 越界（或 from === to）原样返回**同一个引用**：调用方可以靠引用相等跳过无谓的重渲染。
 */
export function movePeriod(data: TimetableData, from: number, to: number): TimetableData {
  const length = data.periods.length;
  if (from === to || from < 0 || from >= length || to < 0 || to >= length) return data;
  const periods = [...data.periods];
  const [moved] = periods.splice(from, 1);
  if (moved === undefined) return data;
  periods.splice(to, 0, moved);
  return {
    ...data,
    periods: periods.map((period, index) => ({ ...period, index: index + 1 })),
  };
}

/** 24 小时制的 `HH:mm`；`8:00` / `24:00` / `08:60` 都不算合法。 */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 校验作息表，返回中文错误信息（空数组 = 合法）。
 *
 * 为什么校验放在 core 而不是组件里：它是自动保存的闸门——错误数据一旦落库，
 * 下次启动周视图的行数/时间就全乱了，而"改坏了还能刷新走人"的前提是没写进去。
 *
 * 检查项（顺序固定，便于测试与用户阅读）：非空 → 编号不重复 → 编号 1..n 连续
 * → 时间是 `HH:mm` → `start < end`。
 */
export function validatePeriods(periods: readonly Period[]): string[] {
  if (periods.length === 0) return ['作息表至少要有一节。'];

  const errors: string[] = [];
  const counts = new Map<number, number>();
  for (const period of periods) counts.set(period.index, (counts.get(period.index) ?? 0) + 1);

  const duplicates = [...counts.keys()]
    .filter((index) => (counts.get(index) ?? 0) > 1)
    .sort((a, b) => a - b);
  for (const index of duplicates) {
    errors.push(`节次编号重复：第 ${index} 节出现了 ${counts.get(index) ?? 0} 次。`);
  }

  const expected = new Set(Array.from({ length: periods.length }, (_, index) => index + 1));
  const missing = [...expected].filter((index) => !counts.has(index));
  if (missing.length > 0) {
    errors.push(`节次编号必须从 1 连续：缺少第 ${missing.join('、')} 节。`);
  }
  const extra = [...counts.keys()].filter((index) => !expected.has(index)).sort((a, b) => a - b);
  if (extra.length > 0) {
    errors.push(`节次编号越界：第 ${extra.join('、')} 节不在 1–${periods.length} 的范围内。`);
  }

  for (const period of periods) {
    const startOk = HH_MM.test(period.start);
    const endOk = HH_MM.test(period.end);
    if (!startOk) {
      errors.push(`第 ${period.index} 节的开始时间「${period.start}」不是 HH:mm（24 小时制）。`);
    }
    if (!endOk) {
      errors.push(`第 ${period.index} 节的结束时间「${period.end}」不是 HH:mm（24 小时制）。`);
    }
    // 格式都不对时比较字符串没有意义，会报一条误导性的"顺序错"。
    if (startOk && endOk && period.start >= period.end) {
      errors.push(
        `第 ${period.index} 节的开始时间必须早于结束时间（当前 ${period.start}–${period.end}）。`,
      );
    }
  }

  return errors;
}

/**
 * 校验排课规则，返回中文错误信息（空数组 = 合法）。
 *
 * 只校验"规则能不能落到作息表上"：星期 1–7、开始节次 ≥ 1、
 * `startPeriod + span - 1` 不超过作息表节数、单双周只有 1/2。
 * 规则之间抢同一格不在这里挡——那是编辑模式用 `occupiedCellKeys` 处理的交互冲突，
 * 不是坏数据，不该拦住自动保存。
 */
export function validateRules(data: TimetableData): string[] {
  const errors: string[] = [];
  const periodCount = data.periods.length;

  data.rules.forEach((rule, index) => {
    const label = `第 ${index + 1} 条规则`;
    if (rule.byDay.length === 0) {
      errors.push(`${label}没有选择星期。`);
    }
    for (const day of rule.byDay) {
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        errors.push(`${label}的星期 ${day} 不合法（必须是 1–7）。`);
      }
    }

    const span = rule.span ?? 1;
    if (!Number.isInteger(rule.startPeriod) || rule.startPeriod < 1) {
      errors.push(`${label}的开始节次必须 ≥ 1（当前 ${rule.startPeriod}）。`);
    }
    if (!Number.isInteger(span) || span < 1) {
      errors.push(`${label}的连堂节数必须 ≥ 1（当前 ${span}）。`);
    }
    if (rule.startPeriod >= 1 && span >= 1) {
      const endPeriod = rule.startPeriod + span - 1;
      if (endPeriod > periodCount) {
        errors.push(`${label}排到第 ${endPeriod} 节，超出了作息表的 ${periodCount} 节。`);
      }
    }

    if (rule.intervalWeeks !== 1 && rule.intervalWeeks !== 2) {
      errors.push(`${label}的单双周只能是「每周」或「单周」。`);
    }
  });

  return errors;
}
