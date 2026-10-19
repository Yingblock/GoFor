/**
 * Code 128（Code Set B）条码 + 纸面短码载荷（P2-2.12）。
 *
 * 二维码（`qr.ts` + `deeplink.ts`）是纸的主要身份证；但二维码在手机大图里
 * 对焦/透视误差下容易糊成一团。这里再加一条 Code 128 作为兜底：
 * 一维码只需要"一行像素"，对**上下方向的模糊不敏感**，拍照时更容易读出来。
 *
 * 载荷刻意做成 16 个 ASCII 字符，不写完整深链：
 *
 * ```
 * G1 + YYMMDD(6) + 纸张码(1) + 模板短码(6) + 页号(1)   // 共 16
 * ```
 *
 * 扫描端拿这 16 个字符去本地坐标清单（`manifest.ts`）里找回
 * 「模板 + 日期 + 纸张 + 页」，不需要联网，也不需要长载荷。
 *
 * 依赖约束：本文件零第三方依赖、不碰 DOM/存储。纸张清单直接复用
 * `print/paper.ts` 的 `PAPER_IDS`，避免两处枚举漂移。
 */

import { PAPER_IDS } from '../print/paper.ts';

/**
 * 标准 Code 128 码表（107 项，值 0–106）。
 *
 * 每项是 6 个"条/空"宽度（从条开始交替）；值 106 是终止符，7 个宽度。
 * 这是 ISO/IEC 15417 的标准表，**不要凭感觉改**：改表必须同时改 golden 断言。
 * 表里每一项的模块和都是 11（终止符 13），条的宽度和是偶数。
 */
export const CODE128_PATTERNS: readonly string[] = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

/** 起始码 B：后面跟 Code Set B（ASCII 32–126）的数据字符。 */
const START_B = 104;
/** 终止符。 */
const STOP = 106;
/** 静区宽度（模块数）：前后各 10 个白模块。 */
const QUIET_ZONE_MODULES = 10;
/**
 * 每个模块宽度的抖动方差。
 *
 * 解码器按"每个模块宽度乘 1±20% 系数"建模：均匀分布 [0.8, 1.2] 的方差
 * = (0.4)² / 12。像素行还额外带 ±0.5 像素的取整误差。
 */
const JITTER_VARIANCE = 0.16 / 12;
/** 相邻两个取整边界之差（±0.5 均匀 → 三角分布）的方差，单位 px²。 */
const ROUNDING_VARIANCE = 1 / 6;

/** 预计算每个符号的宽度数组，避免解码时反复拆字符串。 */
const PATTERN_WIDTHS: readonly (readonly number[])[] = CODE128_PATTERNS.map((pattern) =>
  [...pattern].map((digit) => Number(digit)),
);

/** 把文本按 UTF-8 编码成字节（不依赖 TextEncoder，保证纯函数可测）。 */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

/** FNV-1a 32 位。 */
function fnv1a32(bytes: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 纸面短码字母表：Crockford Base32 的小写形式。
 *
 * 去掉了 `i` `l` `o` `u`：手抄/口述时最容易与 1、0 混淆。固定 32 个字符，
 * 于是 30 位哈希正好编成 6 个字符（每字符 5 位），不多不少。
 */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** 模板 id → 恰好 6 个字符的 base32 短码（FNV-1a 低 30 位）。 */
export function sheetCodeToken(templateId: string): string {
  if (typeof templateId !== 'string') throw new TypeError('模板 id 必须是字符串');
  const value = fnv1a32(utf8Bytes(templateId)) & 0x3fffffff;
  let token = '';
  for (let shift = 25; shift >= 0; shift -= 5) {
    token += ALPHABET.charAt((value >>> shift) & 0x1f);
  }
  return token;
}

/**
 * 生成 16 字符的纸面短码载荷。
 *
 * 写侧和读侧做同样的校验：宁可现在抛错，也不要印出一张扫回来会记到
 * 错误日期/纸张上的纸。
 */
export function encodeSheetCode(input: {
  date: string;
  paper: string;
  templateId: string;
  page: number;
}): string {
  if (!isRealDate(input.date)) throw new Error(`日期不合法：${input.date}`);
  const year = Number(input.date.slice(0, 4));
  // 载荷只存两位年份，按 `20YY` 还原；超出 2000–2099 会把日期印错。
  if (year < 2000 || year > 2099) throw new Error(`纸张码只支持 2000–2099 年：${input.date}`);
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > 9) {
    throw new Error(`页号必须是 1..9：${input.page}`);
  }
  const paperIndex = (PAPER_IDS as readonly string[]).indexOf(input.paper);
  if (paperIndex < 0) throw new Error(`未知纸张：${input.paper}`);

  const yearPart = input.date.slice(2, 4);
  const monthPart = input.date.slice(5, 7);
  const dayPart = input.date.slice(8, 10);
  return (
    `G1${yearPart}${monthPart}${dayPart}` +
    `${ALPHABET.charAt(paperIndex)}` +
    `${sheetCodeToken(input.templateId)}` +
    `${input.page}`
  );
}

/** 从 `encodeSheetCode` 的 16 字符载荷里还原出来的信息。 */
export interface SheetCode {
  /** `YYYY-MM-DD`（年份按 20YY 还原）。 */
  date: string;
  /** `PAPER_IDS` 里的 id。 */
  paper: string;
  /** 6 字符模板短码。 */
  token: string;
  /** 页号 1..9。 */
  page: number;
}

/**
 * 解析纸面短码载荷。任何不合法都返回 null，不抛错——扫描端拿到的是
 * 不可信的像素结果，不能让它把异常冒到界面。
 */
export function parseSheetCode(text: string): SheetCode | null {
  if (typeof text !== 'string' || text.length !== 16) return null;
  if (!text.startsWith('G1')) return null;

  const datePart = text.slice(2, 8);
  if (!/^\d{6}$/.test(datePart)) return null;
  const year = `20${datePart.slice(0, 2)}`;
  const date = `${year}-${datePart.slice(2, 4)}-${datePart.slice(4, 6)}`;
  if (!isRealDate(date)) return null;

  const paperChar = text[8];
  const paperIndex = paperChar === undefined ? -1 : ALPHABET.indexOf(paperChar);
  if (paperIndex < 0 || paperIndex >= PAPER_IDS.length) return null;
  const paper = PAPER_IDS[paperIndex];
  if (paper === undefined) return null;

  const token = text.slice(9, 15);
  if (![...token].every((char) => ALPHABET.includes(char))) return null;

  const pageChar = text[15];
  if (pageChar === undefined || !/^[1-9]$/.test(pageChar)) return null;

  return { date, paper, token, page: Number(pageChar) };
}

/** 判断 `YYYY-MM-DD` 是否是日历上真实存在的日期。 */
function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return days !== undefined && day <= days;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * 把文本编成 Code 128（Code Set B）模块数组。
 *
 * 返回值**包含**左右各 10 个白模块的静区（打印时必须保留，否则扫描端
 * 找不到条码边界）。模块 `true` = 黑，`false` = 白。
 *
 * 只支持 Code Set B：ASCII 32–126。超出范围直接抛错，不做字符集切换。
 */
export function encodeCode128(text: string): boolean[] {
  if (typeof text !== 'string') throw new TypeError('条码内容必须是字符串');
  const values: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined || code < 32 || code > 126) {
      throw new RangeError(`Code 128 B 只支持 ASCII 32..126：${JSON.stringify(char)}`);
    }
    values.push(code - 32);
  }

  let checksum = START_B;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === undefined) continue;
    checksum += value * (i + 1);
  }
  const symbols = [START_B, ...values, checksum % 103, STOP];

  const modules: boolean[] = [];
  for (let i = 0; i < QUIET_ZONE_MODULES; i++) modules.push(false);

  let black = true;
  for (const symbol of symbols) {
    const widths = PATTERN_WIDTHS[symbol];
    if (widths === undefined) continue;
    for (const width of widths) {
      for (let i = 0; i < width; i++) modules.push(black);
      black = !black;
    }
  }

  for (let i = 0; i < QUIET_ZONE_MODULES; i++) modules.push(false);
  return modules;
}

/**
 * 从一行像素里解码 Code 128。
 *
 * @param row 0 = 白，非 0 = 黑；长度任意（可大于条码本身）。
 * @returns 解码文本；解不出返回 null（任何非法输入都不抛错）。
 *
 * 内部会先从第一个黑像素裁到最后一个黑像素（吃掉落纸白边），用 run-length
 * 还原每个符号，再校验起始码 B / mod 103 校验位 / 终止符。整行上下颠倒时
 * 会自动反转再试一次。
 */
export function decodeCode128Row(row: ArrayLike<number>): string | null {
  try {
    const bits = toBits(row);
    if (bits === null) return null;
    const direct = decodeBits(bits);
    if (direct !== null) return direct;

    const reversed = new Uint8Array(bits.length);
    for (let i = 0; i < bits.length; i++) {
      const bit = bits[bits.length - 1 - i];
      reversed[i] = bit === 1 ? 1 : 0;
    }
    return decodeBits(reversed);
  } catch {
    // 扫描路径上收到的是"不可信像素"：数组实现怪异、长度离谱，都不该炸到界面。
    return null;
  }
}

function toBits(row: ArrayLike<number>): Uint8Array | null {
  let length: unknown;
  try {
    length = row.length;
  } catch {
    return null;
  }
  if (typeof length !== 'number' || !Number.isInteger(length) || length <= 0) return null;
  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const value = row[i];
    // 洞/undefined 按白处理；其余非 0（含 NaN）按黑。
    bits[i] = value === undefined || value === 0 ? 0 : 1;
  }
  return bits;
}

function decodeBits(bits: Uint8Array): string | null {
  const runs = collectRuns(bits);
  if (runs === null) return null;
  return decodeRuns(runs);
}

/** 从第一个黑像素裁到最后一个黑像素，返回条/空交替的 run 长度。 */
function collectRuns(bits: Uint8Array): number[] | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 1) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;

  const runs: number[] = [];
  let color = 1;
  let length = 0;
  for (let i = first; i <= last; i++) {
    const bit = bits[i] === 1 ? 1 : 0;
    if (bit === color) {
      length++;
    } else {
      runs.push(length);
      color = bit;
      length = 1;
    }
  }
  runs.push(length);
  return runs;
}

function decodeRuns(runs: readonly number[]): string | null {
  const runCount = runs.length;
  // 每个普通符号 6 个 run，终止符 7 个：R = 6 × (n + 2) + 7。
  if (runCount < 19 || (runCount - 19) % 6 !== 0) return null;
  const dataLength = (runCount - 19) / 6;

  const totalModules = 11 * (dataLength + 2) + 13;
  let totalPixels = 0;
  for (const run of runs) totalPixels += run;
  const modulePixels = totalPixels / totalModules;
  // 一个模块至少占 1 个像素；更小说明是亚像素噪声，不是条码。
  if (!(modulePixels >= 1)) return null;

  const symbols: number[] = [];
  for (let index = 0; index < dataLength + 2; index++) {
    const start = index * 6;
    const match = matchSymbol(runs, start, 6, modulePixels);
    if (match === null) return null;
    symbols.push(match);
  }
  const stop = matchSymbol(runs, (dataLength + 2) * 6, 7, modulePixels);
  if (stop !== STOP) return null;

  if (symbols[0] !== START_B) return null;

  let checksum = START_B;
  let text = '';
  for (let i = 1; i <= dataLength; i++) {
    const value = symbols[i];
    if (value === undefined || value < 0 || value > 94) return null;
    checksum += value * i;
    text += String.fromCharCode(value + 32);
  }
  if (symbols[dataLength + 1] !== checksum % 103) return null;
  return text;
}

/**
 * 在码表里找与给定 run 段最匹配的符号。
 *
 * 不用"四舍五入成整数模块再查表"：模块宽度 3 在 ±20% 抖动下可能变成
 * 2.4 个模块，直接取整会查到错误符号。这里按"每个模块的抖动方差 +
 * 像素取整方差"做加权最小二乘，离群坐标会被自动降权。
 */
function matchSymbol(
  runs: readonly number[],
  start: number,
  length: number,
  modulePixels: number,
): number | null {
  let bestValue = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let value = 0; value < PATTERN_WIDTHS.length; value++) {
    const widths = PATTERN_WIDTHS[value];
    if (widths === undefined || widths.length !== length) continue;
    const score = patternScore(runs, start, widths, modulePixels);
    if (score < bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }
  return bestValue < 0 ? null : bestValue;
}

function patternScore(
  runs: readonly number[],
  start: number,
  widths: readonly number[],
  modulePixels: number,
): number {
  let score = 0;
  for (let i = 0; i < widths.length; i++) {
    const run = runs[start + i];
    const expected = widths[i];
    if (run === undefined || expected === undefined) return Number.POSITIVE_INFINITY;
    const observedModules = run / modulePixels;
    // 抖动方差随模块宽度线性增长；取整误差是固定像素方差，换算成模块。
    const variance = JITTER_VARIANCE * expected + ROUNDING_VARIANCE / (modulePixels * modulePixels);
    const difference = observedModules - expected;
    score += (difference * difference) / variance;
  }
  return score;
}
