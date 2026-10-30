/**
 * 单词库 v1 的导入解析（P3-3.7 / P4-4.16）。
 *
 * 只做 CSV/TSV → `{term, meaning, tags}`，不碰存储、不做复习。
 * 为什么放 core：解析规则（引号、转义、表头、标签分隔）是最容易出错的部分，
 * 放在纯函数里才能用真实导出的词表跑测试；UI 只负责把结果写进 pluginData。
 */

export type WordbookDelimiter = ',' | '\t' | ';';

export interface WordbookRow {
  term: string;
  meaning: string;
  tags: string[];
}

export interface WordbookParseResult {
  rows: WordbookRow[];
  /** 空行/缺词/重复合并之外真正丢掉的条数。 */
  skipped: number;
  /** 表头被识别并跳过时为 true。 */
  headerDetected: boolean;
  delimiter: WordbookDelimiter;
}

export interface WordbookParseOptions {
  /** 不传就自动判断（有 Tab 用 Tab，否则看分号/逗号）。 */
  delimiter?: WordbookDelimiter;
}

const HEADER_TERMS = new Set(['单词', '词', 'word', 'words', 'term', '英文', 'english']);
const HEADER_MEANINGS = new Set([
  '释义',
  '意思',
  '中文',
  '翻译',
  'meaning',
  'definition',
  'translation',
]);

/** 自动判断分隔符：Tab 优先（Excel/Anki 导出最常见），其次分号，再逗号。 */
export function detectDelimiter(text: string): WordbookDelimiter {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  if (firstLine.includes('\t')) return '\t';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  if (semicolons > 0 && commas === 0) return ';';
  return ',';
}

/**
 * 解析 CSV/TSV。
 *
 * 支持：双引号包裹的字段（里面可以有分隔符与换行）、`""` 转义、CRLF、BOM。
 * 不支持：转义的反斜杠、Excel 的 `sep=;` 首行——遇到时按普通行跳过，
 * 不猜（猜错会把 `sep=;` 当成一个单词存进词库）。
 */
export function parseWordbook(
  text: string,
  options: WordbookParseOptions = {},
): WordbookParseResult {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = options.delimiter ?? detectDelimiter(source);
  const records = parseRecords(source, delimiter);
  const rows: WordbookRow[] = [];
  const byTerm = new Map<string, WordbookRow>();
  let skipped = 0;
  let headerDetected = false;

  for (const [index, record] of records.entries()) {
    const cells = record.map((cell) => cell.trim());
    if (cells.every((cell) => cell === '')) continue;

    if (index === 0 && isHeader(cells)) {
      headerDetected = true;
      continue;
    }

    const term = cells[0] ?? '';
    if (term === '' || term.startsWith('sep=')) {
      skipped += 1;
      continue;
    }

    const meaning = cells[1] ?? '';
    const tags = parseTags(cells[2] ?? '');
    const key = term.toLowerCase();
    const existing = byTerm.get(key);
    if (existing) {
      // 同一个词出现两次：保留第一次的释义，把标签并起来（不是静默丢数据）。
      existing.tags = dedupe([...existing.tags, ...tags]);
      continue;
    }

    const row: WordbookRow = { term, meaning, tags };
    byTerm.set(key, row);
    rows.push(row);
  }

  return { rows, skipped, headerDetected, delimiter };
}

function isHeader(cells: string[]): boolean {
  const first = (cells[0] ?? '').toLowerCase();
  const second = (cells[1] ?? '').toLowerCase();
  if (!HEADER_TERMS.has(first)) return false;
  // 只有一列时 `word` 也可能是真单词，要求第二列像表头（或不存在）。
  return second === '' || HEADER_MEANINGS.has(second);
}

function parseTags(cell: string): string[] {
  if (cell.trim() === '') return [];
  return dedupe(
    cell
      .split(/[;|,、]/)
      .map((tag) => tag.trim().replace(/^#+/, ''))
      .filter(Boolean),
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 逐字符解析。手写而不是 `text.split(delimiter)`：引号里的逗号在释义中很常见
 * （"a small, round object"），按分隔符硬切会把一条词拆成两条。
 */
function parseRecords(text: string, delimiter: WordbookDelimiter): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? '';

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field.trim() === '') {
      // 只有字段开头（忽略前导空格）的引号才是引用开始。
      field = '';
      quoted = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      record.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\n' || char === '\r') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      // CRLF 当作一个换行。
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/* --------------------------------------------------- 词库条目（P3-3.7） */

import type { WordbookEntry, WordbookQuery } from '@gofor/plugin-api';

/**
 * 按关键词 / 标签过滤。大小写不敏感，空查询返回全部。
 *
 * 为什么在 core：这是"查"的语义，周报、搜索、单词库页面必须用同一套；
 * 各自写一个 `includes` 迟早出现"页面搜得到、搜索接口搜不到"。
 */
export function filterWordbookEntries(
  entries: readonly WordbookEntry[],
  query: WordbookQuery = {},
): WordbookEntry[] {
  const needle = query.query?.trim().toLowerCase() ?? '';
  const tag = query.tag?.trim();
  return entries.filter((entry) => {
    if (tag !== undefined && tag !== '' && !entry.tags.includes(tag)) return false;
    if (needle === '') return true;
    return (
      entry.term.toLowerCase().includes(needle) || entry.meaning.toLowerCase().includes(needle)
    );
  });
}

export interface MergeWordbookOptions {
  now: number;
  newId: () => string;
}

export interface MergeWordbookResult {
  entries: WordbookEntry[];
  added: number;
  updated: number;
}

/**
 * 把导入的行合并进已有词库。
 *
 * 同一个词（忽略大小写）只留一条：释义用新导入的覆盖（导入即"我要换成这份"），
 * 标签取并集（不然重复导入一份没带标签的表会把已有标签清掉）。
 */
export function mergeWordbookEntries(
  existing: readonly WordbookEntry[],
  rows: readonly WordbookRow[],
  options: MergeWordbookOptions,
): MergeWordbookResult {
  const map = new Map(existing.map((entry) => [entry.term.toLowerCase(), { ...entry }]));
  let added = 0;
  let updated = 0;

  for (const row of rows) {
    const key = row.term.toLowerCase();
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        id: options.newId(),
        term: row.term,
        meaning: row.meaning,
        tags: [...row.tags],
        createdAt: options.now,
        updatedAt: options.now,
      });
      added += 1;
      continue;
    }
    const meaning = row.meaning === '' ? current.meaning : row.meaning;
    const tags = [...new Set([...current.tags, ...row.tags])];
    map.set(key, { ...current, meaning, tags, updatedAt: options.now });
    updated += 1;
  }

  return { entries: [...map.values()], added, updated };
}
