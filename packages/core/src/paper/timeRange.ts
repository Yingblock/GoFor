/**
 * 纸面时间登记的手写解析。
 *
 * 为什么需要它：相比"涂满格子"，学生在纸上更愿意直接写「19:30~20:15」。
 * 但手写时间形态极多（19:30 / 1930 / 19.30 / 19点30 / 7:30-8:15 / 19:30到20:15），
 * 通用 OCR 会把这些当成普通文本。这里用**格式先验**把搜索空间压到极小：
 * 只有 0–23 时、0–59 分、少数几种分隔符，所以不需要 OCR 模型也不会离谱。
 *
 * 关键设计：**歧义不靠算法猜，靠版面消除**。
 * 纸面按「上午 / 下午 / 晚上」分块，块标题就是 `dayPart`，
 * 于是「7:30」在晚上那栏自动补成 19:30，在上午那栏就是 07:30。
 */

export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface ParsedTimeRange {
  /** 开始时间，当日第几分钟（0–1439）。跨零点后会大于 1439。 */
  start: number;
  /** 结束时间；只写了开始则为 null，由调用方套默认时长。 */
  end: number | null;
  /** 归一化后的原始文本，回填时展示给用户确认。 */
  raw: string;
}

export type ParseTimeResult = { ok: true; value: ParsedTimeRange } | { ok: false; error: string };

/** 全角数字与常见全角标点转半角。 */
export function normalizeWidth(input: string): string {
  return input
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[．。]/g, '.')
    .replace(/[～]/g, '~')
    .replace(/[—–ー－]/g, '-');
}

/** 分隔两个时间的符号：- ~ 、以及中文的「到 / 至」。 */
const RANGE_SEPARATOR = /\s*(?:-|~|到|至)\s*/;

function applyDayPart(hour: number, dayPart?: DayPart): number {
  if (!dayPart) return hour;
  // 只对 0–11 的"口语小时"补 12；已经写了 13–23 的一律不动。
  if (hour > 12) return hour;
  if (dayPart === 'morning') return hour;
  if (dayPart === 'afternoon') return hour <= 6 ? hour + 12 : hour;
  // evening：1–11 视为 13–23，0 点保留为午夜
  return hour === 0 ? 0 : hour + 12;
}

/**
 * 解析单个时间点，返回当日分钟数；无法解析返回 null。
 * 支持：19:30 / 19.30 / 1930 / 19点30 / 19时30分 / 19点 / 1930
 */
export function parseTimeOfDay(token: string, dayPart?: DayPart): number | null {
  const text = normalizeWidth(token).trim();
  if (text === '') return null;

  // 纯 3–4 位数字当作 HHmm
  const digitsOnly = /^(\d{3,4})$/.exec(text);
  if (digitsOnly) {
    const digits = digitsOnly[1] ?? '';
    const hour = Number(digits.slice(0, digits.length - 2));
    const minute = Number(digits.slice(-2));
    if (hour > 23 || minute > 59) return null;
    return applyDayPart(hour, dayPart) * 60 + minute;
  }

  const withSeparator = /^(\d{1,2})(?:[:.时点])?(\d{1,2})?分?$/.exec(text);
  if (!withSeparator) return null;

  const hour = Number(withSeparator[1]);
  const minuteRaw = withSeparator[2];
  const minute = minuteRaw === undefined ? 0 : Number(minuteRaw);

  if (hour > 23 || minute > 59) return null;
  return applyDayPart(hour, dayPart) * 60 + minute;
}

export interface ParseTimeRangeOptions {
  /** 纸面分栏（上午/下午/晚上），用于消除「7:30」的歧义。 */
  dayPart?: DayPart;
  /** 跨零点判定阈值：结束早于开始超过这个分钟数，就不再认为是跨天。 */
  maxDurationMinutes?: number;
}

/**
 * 解析一段「起 ~ 止」。
 *
 * 容错策略：
 * - 只写开始（如 `19:30`）→ end 为 null，调用方按默认时长补
 * - 结束早于开始（如 `23:30-0:30`）→ 视为跨零点，end 加一天
 * - 解析不出来就明确失败，**不猜**，交给回填的待确认列表
 */
export function parseTimeRange(raw: string, options: ParseTimeRangeOptions = {}): ParseTimeResult {
  const normalized = normalizeWidth(raw).trim();
  if (normalized === '') return { ok: false, error: '空输入' };

  const parts = normalized.split(RANGE_SEPARATOR).filter((part) => part !== '');
  const first = parts[0];
  if (first === undefined) return { ok: false, error: '未找到时间' };

  const start = parseTimeOfDay(first, options.dayPart);
  if (start === null) return { ok: false, error: `无法解析开始时间：${first}` };

  if (parts.length === 1) {
    return { ok: true, value: { start, end: null, raw: normalized } };
  }

  const second = parts[1];
  if (second === undefined) return { ok: true, value: { start, end: null, raw: normalized } };

  const end = parseTimeOfDay(second, options.dayPart);
  if (end === null) return { ok: false, error: `无法解析结束时间：${second}` };

  const maxDuration = options.maxDurationMinutes ?? 8 * 60;
  if (end === start) return { ok: false, error: '起止时间相同' };

  // 23:30 → 0:30 这类跨零点：先补一天，再由时长上限兜住离谱输入
  const normalizedEnd = end < start ? end + 24 * 60 : end;

  const duration = normalizedEnd - start;
  if (duration > maxDuration) return { ok: false, error: `时长异常（${duration} 分钟）` };

  return { ok: true, value: { start, end: normalizedEnd, raw: normalized } };
}
