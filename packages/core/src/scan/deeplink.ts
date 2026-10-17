/**
 * 二维码里写什么：`gofor://fill` 深链。
 *
 * 二维码是这张纸的"身份证"：它只回答三件事——这是哪个模板、哪一天、什么纸。
 * 勾选状态不在这里，靠坐标注册表（`manifest.ts`）逐格采样。
 *
 * 格式刻意用自定义 scheme 而不是 `https://` 链接：
 * - 扫码时不会被浏览器接管、不会把学生导去某个网站；
 * - 纸张是离线产物，链接里不需要域名与服务器；
 * - `http(s)://` 看起来像网页，会诱导用户点开，所以一律拒绝。
 *
 * 参数顺序固定为 `v, t, d, p`，方便人眼比对与测试断言：
 *
 * ```
 * gofor://fill?v=1&t=day&d=2026-03-05&p=A4
 * ```
 */

/** 回填二维码的载荷。 */
export interface FillLink {
  /** 模板 id，例如 `day`；允许中文与空格。 */
  templateId: string;
  /** 纸上印的日期，`YYYY-MM-DD`。 */
  date: string;
  /** 纸张 id，例如 `A4`。 */
  paper: string;
  /** 载荷版本。改格式必须升版本，旧纸才不会被静默误读。 */
  version: 1;
}

export type ParseFillLinkResult = { ok: true; value: FillLink } | { ok: false; reason: string };

/** 查询参数的固定顺序；也是"必需参数"的清单。 */
const QUERY_KEYS = ['v', 't', 'd', 'p'] as const;
type QueryKey = (typeof QUERY_KEYS)[number];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isQueryKey(key: string): key is QueryKey {
  return (QUERY_KEYS as readonly string[]).includes(key);
}

function fail(reason: string): ParseFillLinkResult {
  return { ok: false, reason };
}

/** 解析一个查询参数；格式错误返回 null，而不是悄悄吞掉。 */
function decodeComponent(text: string): string | null {
  try {
    // 表单编码把空格写成 `+`；外部生成的二维码可能这么写，这里兼容。
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * 日期必须**格式与日历都对**。
 *
 * `2026-02-30` 能过正则但不是真实日期；如果放过去，这张纸会被记到一天不存在的日子上。
 * 不用 `Date` 判断：`Date.UTC(26, ...)` 会把 0–99 当年份偏移，行为不直观。
 */
function isRealDate(text: string): boolean {
  const match = DATE_PATTERN.exec(text);
  if (!match) return false;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (year === undefined || month === undefined || day === undefined) return false;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (yearNumber < 1 || monthNumber < 1 || monthNumber > 12) return false;
  const days = monthNumber === 2 && isLeapYear(yearNumber) ? 29 : DAYS_IN_MONTH[monthNumber - 1];
  return days !== undefined && dayNumber >= 1 && dayNumber <= days;
}

/**
 * 生成二维码内容。
 *
 * 写侧做与读侧同样的校验：印出去一张日期非法的纸，比抛错更糟——
 * 错误会拖到"拍回来才发现"，而且那时已经没有补救手段。
 */
export function buildFillLink(link: FillLink): string {
  if (link.templateId === '') throw new Error('模板 id 不能为空');
  if (!isRealDate(link.date)) throw new Error(`日期不合法：${link.date}`);
  if (link.paper === '') throw new Error('纸张不能为空');
  return (
    `gofor://fill?v=${link.version}` +
    `&t=${encodeURIComponent(link.templateId)}` +
    `&d=${encodeURIComponent(link.date)}` +
    `&p=${encodeURIComponent(link.paper)}`
  );
}

/**
 * 解析二维码内容；失败给中文短句，直接显示在扫描结果页。
 *
 * 严格拒绝：非 `gofor://fill`、缺参数、空参数、参数重复、参数不认识、版本不认识、日期非法。
 * 宁可让用户看到"这张纸不是回填码"，也不要猜着读——猜错的代价是往错误的一天写数据。
 */
export function parseFillLink(text: string): ParseFillLinkResult {
  const raw = text.trim();
  if (raw === '') return fail('内容为空，不是有效的回填二维码');

  const schemeEnd = raw.indexOf('://');
  if (schemeEnd < 0) return fail('只接受 gofor://fill 链接');
  const scheme = raw.slice(0, schemeEnd).toLowerCase();
  if (scheme !== 'gofor') return fail(`不支持的链接协议：${scheme}://，只接受 gofor://fill`);

  const afterScheme = raw.slice(schemeEnd + 3);
  const queryIndex = afterScheme.indexOf('?');
  const authority = queryIndex < 0 ? afterScheme : afterScheme.slice(0, queryIndex);
  if (authority.toLowerCase() !== 'fill') return fail('只接受 gofor://fill 链接');
  const query = queryIndex < 0 ? '' : afterScheme.slice(queryIndex + 1);

  const params = new Map<QueryKey, string>();
  if (query !== '') {
    for (const part of query.split('&')) {
      // 容忍末尾多一个 `&`，其它空段是真错误。
      if (part === '') continue;
      const equalIndex = part.indexOf('=');
      if (equalIndex < 0) return fail('参数格式应为 key=value');
      const key = decodeComponent(part.slice(0, equalIndex));
      const value = decodeComponent(part.slice(equalIndex + 1));
      if (key === null || value === null) return fail('参数编码有误');
      if (key === '') return fail('参数名不能为空');
      if (!isQueryKey(key)) return fail(`不认识的参数：${key}`);
      if (params.has(key)) return fail(`参数重复：${key}`);
      params.set(key, value);
    }
  }

  for (const key of QUERY_KEYS) {
    if (!params.has(key)) return fail(`缺少参数 ${key}`);
  }
  for (const key of QUERY_KEYS) {
    if (params.get(key) === '') return fail(`参数 ${key} 不能为空`);
  }

  const version = params.get('v');
  if (version !== '1') return fail(`版本号不认识：${version ?? ''}`);

  const templateId = params.get('t') ?? '';
  const date = params.get('d') ?? '';
  const paper = params.get('p') ?? '';

  if (!DATE_PATTERN.test(date)) return fail(`日期格式应为 YYYY-MM-DD：${date}`);
  if (!isRealDate(date)) return fail(`日期不存在：${date}`);

  return { ok: true, value: { templateId, date, paper, version: 1 } };
}
