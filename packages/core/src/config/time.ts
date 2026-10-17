/**
 * 时间解析与课时推导。
 *
 * 这里是「所有不确定的东西都从配置/课表推导」的落点：
 * 一节课多少分钟不写死在代码里，而是从导入的作息表算出来。
 */

/** 解析 "HH:mm" 为「当日第几分钟」。格式合法性由 schema 层保证。 */
export function parseClockTime(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':');
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

export interface PeriodLike {
  start: string;
  end: string;
}

/** 一节课的时长（分钟）。 */
export function periodMinutes(period: PeriodLike): number {
  return parseClockTime(period.end) - parseClockTime(period.start);
}

/**
 * 从作息表推断「一节课多少分钟」。
 *
 * 取**中位数**并四舍五入到 5 分钟，而不是取第一条或平均数：
 * 真实作息表里常有早读 30 分钟、课间操 25 分钟之类的小段，
 * 平均值会被它们拉偏，而中位数不受影响。
 *
 * 返回 `undefined` 表示作息表为空，调用方应回退到默认值。
 */
export function derivePeriodMinutes(periods: readonly PeriodLike[]): number | undefined {
  const durations = periods
    .map(periodMinutes)
    .filter((minutes) => minutes > 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) return undefined;

  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 1
      ? (durations[mid] ?? 0)
      : Math.round(((durations[mid - 1] ?? 0) + (durations[mid] ?? 0)) / 2);

  return Math.round(median / 5) * 5;
}
