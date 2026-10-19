/**
 * 打印模板的「宿主侧解析」：把配置里的模板 id 变成可渲染的 `PrintTemplate`。
 *
 * 为什么不在 core 里做：模板来源有两个——内置常量（core）与用户模板（Dexie）。
 * 用户模板的 JSON 只有宿主知道怎么取，core 不应该碰存储。
 *
 * 一条硬规则：**打印页、模板编辑器、`PrintLayer` 与二维码必须解析出同一个模板**。
 * 以前模板 id 和纸张只活在模板编辑器的本地 state 里，打印层却读配置，
 * 结果就是「预览是我的一天 A5，打出来是默认模板 A4」。
 */

import type { StoredTemplate } from '@gofor/core/domain';
import {
  BLOCK_KINDS,
  BUILTIN_TEMPLATES,
  CALIBRATION_TEMPLATE,
  PAPER_IDS,
  type PaperId,
  type PrintTemplate,
  paperFor,
} from '@gofor/core/print';

/** 模板下拉里的一项。 */
export interface PrintTemplateChoice {
  id: string;
  name: string;
  /** 用户模板（可编辑），内置模板是常量、只读。 */
  custom: boolean;
}

/** 内置模板 + 校准页。校准页不进 `BUILTIN_TEMPLATES`，但它同样可被选为打印模板。 */
export const PRINT_TEMPLATE_CONSTANTS: readonly PrintTemplate[] = [
  ...BUILTIN_TEMPLATES,
  CALIBRATION_TEMPLATE,
];

const BLOCK_KIND_SET = new Set<string>(BLOCK_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isInteger(value: unknown, min = 0): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

/**
 * 区块形状检查：坏区块进渲染层会直接白屏，宁可在列表里跳过整份模板。
 *
 * 为什么细到每个 kind：`materialize()` 的 `cloneBlock` 会直接 `[...block.labels]` /
 * `[...block.showMeta]`，字段缺失时不是排版变差，而是**抛异常**。这里按 kind 把
 * 渲染层/版式层真正会碰的字段都过一遍，保证 `parseStoredTemplate` 的返回值能安全渲染。
 */
function isBlockLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id === '') return false;
  if (typeof value.kind !== 'string' || !BLOCK_KIND_SET.has(value.kind)) return false;
  if (!isInteger(value.span, 1) || (value.span as number) > 12) return false;

  switch (value.kind) {
    case 'title':
      return isString(value.text) && (value.align === 'left' || value.align === 'center');
    case 'hintLine':
    case 'footer':
      return isString(value.text);
    case 'timestamp':
      return isString(value.label);
    case 'checkboxList':
      return isString(value.bind) && isInteger(value.rows) && isStringArray(value.showMeta);
    case 'schedule':
      return isInteger(value.rows) && isString(value.title);
    case 'timeLog':
      return (
        isInteger(value.rows) &&
        isString(value.label) &&
        (value.dayPart === 'morning' ||
          value.dayPart === 'afternoon' ||
          value.dayPart === 'evening')
      );
    case 'checkboxGrid':
      return isInteger(value.rows) && isInteger(value.cols, 1);
    case 'ratingGrid':
      return (
        isStringArray(value.labels) &&
        value.labels.length > 0 &&
        isInteger(value.scale, 1) &&
        (value.keys === undefined || isStringArray(value.keys))
      );
    case 'table':
      return (
        isString(value.bind) &&
        isInteger(value.rows) &&
        isStringArray(value.headers) &&
        value.headers.length > 0
      );
    case 'slots':
      return isStringArray(value.labels) && value.labels.length > 0;
    case 'linedBox':
      return isString(value.label) && isInteger(value.lines);
    case 'qrcode':
      return typeof value.sizeMm === 'number' && Number.isFinite(value.sizeMm) && value.sizeMm > 0;
    case 'progressDots':
      return isInteger(value.total, 1);
    case 'pageBreak':
      return true;
    default:
      return false;
  }
}

/**
 * 解析 `StoredTemplate.json`；坏数据返回 `null`，由调用方跳过。
 *
 * 这里不信任库里的任何字段：模板可能来自旧版本、手改过的备份或导入文件。
 * 不做完整 schema 校验（core 的 `validateBlock` 也只在打印前用），
 * 但至少保证「渲染层会碰到的字段」类型正确，不会因为一条坏模板把整页打挂。
 */
export function parseStoredTemplate(json: string): PrintTemplate | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const { id, name, paper, margin, blocks } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string') return null;
  if (typeof paper !== 'string' || !PAPER_IDS.includes(paper as PaperId)) return null;
  if (!Array.isArray(blocks) || !blocks.every(isBlockLike)) return null;
  if (margin !== undefined) {
    if (!isRecord(margin)) return null;
    for (const key of ['top', 'right', 'bottom', 'left'] as const) {
      if (typeof margin[key] !== 'number' || !Number.isFinite(margin[key])) return null;
    }
  }

  return {
    id,
    name,
    paper: paper as PaperId,
    ...(margin === undefined
      ? {}
      : {
          margin: {
            top: margin.top as number,
            right: margin.right as number,
            bottom: margin.bottom as number,
            left: margin.left as number,
          },
        }),
    blocks: blocks as PrintTemplate['blocks'],
  };
}

/** 内置模板或校准页的 id（不需要查库就能解析）。 */
export function isBuiltinTemplateId(id: string): boolean {
  return PRINT_TEMPLATE_CONSTANTS.some((template) => template.id === id);
}

/** 下拉列表：内置（含校准页）+ 用户模板；坏数据跳过。 */
export function printTemplateChoices(customs: StoredTemplate[]): PrintTemplateChoice[] {
  const builtin: PrintTemplateChoice[] = PRINT_TEMPLATE_CONSTANTS.map((template) => ({
    id: template.id,
    name: template.name,
    custom: false,
  }));

  const custom: PrintTemplateChoice[] = [];
  for (const stored of customs) {
    const parsed = parseStoredTemplate(stored.json);
    if (!parsed) continue;
    custom.push({ id: parsed.id, name: parsed.name, custom: true });
  }

  return [...builtin, ...custom];
}

/**
 * 按「配置里的模板 id + 配置里的纸张」拿到当前应打印的模板。
 *
 * - 内置 / 校准：走 `paperFor()`，A5 等小纸会自动换精简行数；
 * - 用户模板：JSON 里存的是自己的默认纸张，这里**用配置的纸张覆盖**，
 *   因为纸张是全局打印设置，切换后必须真的重排；
 * - 找不到 / 坏数据：回退到默认「我的一天」，绝不让打印页白屏。
 */
export function resolvePrintTemplate(
  templateId: string,
  paper: PaperId,
  customs: StoredTemplate[],
): PrintTemplate {
  if (isBuiltinTemplateId(templateId)) {
    return paperFor(templateId, paper);
  }

  const stored = customs.find((template) => template.id === templateId);
  const parsed = stored ? parseStoredTemplate(stored.json) : null;
  if (parsed) return { ...parsed, paper };

  return paperFor(PRINT_TEMPLATE_CONSTANTS[0]?.id ?? 'day', paper);
}

/**
 * 编辑器里的选择 id：用户模板用 `custom:` 前缀与内置区分。
 * 打印配置里存的是裸 id（不带前缀），扫描二维码时也用它。
 */
export const CUSTOM_TEMPLATE_PREFIX = 'custom:';

export function editorSelectionId(templateId: string): string {
  return isBuiltinTemplateId(templateId) ? templateId : `${CUSTOM_TEMPLATE_PREFIX}${templateId}`;
}

export function customIdFromSelection(selectionId: string): string | null {
  return selectionId.startsWith(CUSTOM_TEMPLATE_PREFIX)
    ? selectionId.slice(CUSTOM_TEMPLATE_PREFIX.length)
    : null;
}
