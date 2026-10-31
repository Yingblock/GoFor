/**
 * 打印模板的「宿主侧解析」：把配置里的模板 id 变成可渲染的 `PrintTemplate`。
 *
 * 模板来源有两个——内置常量（core）与用户模板（Dexie）。本文件只做纯解析，
 * 不碰存储；取用户模板 JSON 仍是宿主的事。放在 core/print 是因为它只依赖
 * 内置模板与 `StoredTemplate` 类型，不属于插件专用逻辑。
 *
 * 一条硬规则：**打印页、模板编辑器、`PrintLayer` 与二维码必须解析出同一个模板**。
 * 以前模板 id 和纸张只活在模板编辑器的本地 state 里，打印层却读配置，
 * 结果就是「预览是我的一天 A5，打出来是默认模板 A4」。
 */

import type { StoredTemplate } from '../domain/entities.ts';
import { BLOCK_KINDS } from './blocks.ts';
import { PAPER_IDS, type PaperId } from './paper.ts';
import { type PrintTemplate, paperForTemplate } from './templates.ts';

/** 模板下拉里的一项。 */
export interface PrintTemplateChoice {
  id: string;
  name: string;
  /** 用户模板（可编辑），内置模板是常量、只读。 */
  custom: boolean;
}

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
    case 'habitRow':
      // rows 由 materialize 按当天打卡项算，模板里可以没有；有就必须是正整数。
      return value.rows === undefined || isInteger(value.rows, 1);
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

/** 是否存在某个已注册模板（插件注册，不在 core 内置）。 */
export function isRegisteredTemplateId(
  id: string,
  templates: readonly PrintTemplate[],
): boolean {
  return templates.some((template) => template.id === id);
}

/** 下拉列表：插件注册模板 + 用户模板；坏数据跳过。 */
export function printTemplateChoices(
  templates: readonly PrintTemplate[],
  customs: StoredTemplate[],
): PrintTemplateChoice[] {
  const registered: PrintTemplateChoice[] = templates.map((template) => ({
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

  return [...registered, ...custom];
}

/**
 * 按「配置里的模板 id + 配置里的纸张」拿到当前应打印的模板。
 *
 * 模板只能来自插件注册或用户模板；core 不再内置任何模板。
 * 找不到时回退到第一个已注册模板；一个都没有时返回 null。
 */
export function resolvePrintTemplate(
  templateId: string,
  paper: PaperId,
  templates: readonly PrintTemplate[],
  customs: StoredTemplate[],
): PrintTemplate | null {
  const registered = templates.find((template) => template.id === templateId);
  if (registered) return paperForTemplate(registered, paper);

  const stored = customs.find((template) => template.id === templateId);
  const parsed = stored ? parseStoredTemplate(stored.json) : null;
  if (parsed) return { ...parsed, paper };

  const fallback = templates[0];
  return fallback ? paperForTemplate(fallback, paper) : null;
}

/**
 * 编辑器里的选择 id：用户模板用 `custom:` 前缀与内置区分。
 * 打印配置里存的是裸 id（不带前缀），扫描二维码时也用它。
 */
export const CUSTOM_TEMPLATE_PREFIX = 'custom:';

export function editorSelectionId(
  templateId: string,
  templates: readonly PrintTemplate[],
): string {
  return isRegisteredTemplateId(templateId, templates)
    ? templateId
    : `${CUSTOM_TEMPLATE_PREFIX}${templateId}`;
}

export function customIdFromSelection(selectionId: string): string | null {
  return selectionId.startsWith(CUSTOM_TEMPLATE_PREFIX)
    ? selectionId.slice(CUSTOM_TEMPLATE_PREFIX.length)
    : null;
}
