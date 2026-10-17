import { describe, expect, it } from 'vitest';
import {
  type Block,
  type LinedBoxBlock,
  type TimeLogBlock,
  type TitleBlock,
  validateBlock,
} from './blocks.ts';
import { layout } from './layout.ts';
import type { PaperId } from './paper.ts';
import {
  BUILTIN_TEMPLATES,
  CALIBRATION_TEMPLATE,
  materialize,
  type PrintTemplate,
  paperFor,
} from './templates.ts';

const CONTEXT = { date: '2026-03-05', dateLabel: '2026 年 3 月 5 日' };

const REQUIRED_TEMPLATE_IDS = ['day', 'week', 'checkin', 'index-card', 'countdown'] as const;

function templateById(id: string): PrintTemplate {
  const found = BUILTIN_TEMPLATES.find((template) => template.id === id);
  if (!found) throw new Error(`缺少内置模板：${id}`);
  return found;
}

function titleOf(blocks: readonly Block[]): TitleBlock {
  const block = blocks.find((candidate) => candidate.kind === 'title');
  if (block?.kind !== 'title') throw new Error('没有 title 区块');
  return block;
}

function linedBoxesOf(blocks: readonly Block[]): LinedBoxBlock[] {
  return blocks.filter((block): block is LinedBoxBlock => block.kind === 'linedBox');
}

function timeLogsOf(blocks: readonly Block[]): TimeLogBlock[] {
  return blocks.filter((block): block is TimeLogBlock => block.kind === 'timeLog');
}

function taskRowsOf(blocks: readonly Block[]): number {
  const block = blocks.find((candidate) => candidate.id === 'tasks');
  if (block?.kind !== 'checkboxList') throw new Error('没有 tasks 清单区块');
  return block.rows;
}

describe('模板：内置清单', () => {
  it('至少 5 个模板，id 唯一且覆盖全部 5 种', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const ids = BUILTIN_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED_TEMPLATE_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('每个模板都有 name 与合法纸张', () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.blocks.length).toBeGreaterThan(0);
    }
  });

  it('所有模板区块都通过 validateBlock', () => {
    for (const template of BUILTIN_TEMPLATES) {
      for (const block of materialize(template, CONTEXT)) {
        expect(validateBlock(block), `${template.id}/${block.id}`).toEqual([]);
      }
    }
  });
});

describe('模板：一页放得下', () => {
  it('每个内置模板在 A4 与 A5 上都只有一页且不丢块', () => {
    for (const template of BUILTIN_TEMPLATES) {
      for (const paper of ['A4', 'A5'] as const satisfies readonly PaperId[]) {
        const blocks = materialize(paperFor(template.id, paper), CONTEXT);
        const result = layout(blocks, { paper });
        expect(result.dropped, `${template.id}/${paper} 有区块被丢弃`).toEqual([]);
        expect(result.pages.length, `${template.id}/${paper} 分了多页`).toBe(1);
        expect(result.warnings, `${template.id}/${paper} 有版式告警`).toEqual([]);
      }
    }
  });

  it('每个模板在推荐纸张上也只有一页', () => {
    for (const template of BUILTIN_TEMPLATES) {
      const result = layout(materialize(template, CONTEXT), { paper: template.paper });
      expect(result.dropped, `${template.id}/${template.paper} 有区块被丢弃`).toEqual([]);
      expect(result.pages.length, `${template.id}/${template.paper} 分了多页`).toBe(1);
    }
  });

  it('day 在 A4 一行不少，在 A5 自动精简', () => {
    const a4 = materialize(paperFor('day', 'A4'), CONTEXT);
    expect(taskRowsOf(a4)).toBe(10);
    expect(timeLogsOf(a4).map((block) => block.rows)).toEqual([2, 2, 2]);

    const a5 = materialize(paperFor('day', 'A5'), CONTEXT);
    expect(taskRowsOf(a5)).toBe(4);
    expect(timeLogsOf(a5).map((block) => block.rows)).toEqual([1, 1, 1]);
  });

  it('week 在 A4 每天 3 行，在 A5 精简到 2 行', () => {
    expect(linedBoxesOf(materialize(paperFor('week', 'A4'), CONTEXT)).map((b) => b.lines)).toEqual(
      Array.from({ length: 7 }, () => 3),
    );
    expect(linedBoxesOf(materialize(paperFor('week', 'A5'), CONTEXT)).map((b) => b.lines)).toEqual(
      Array.from({ length: 7 }, () => 2),
    );
  });
});

describe('模板：materialize', () => {
  it('有标题的模板使用 context.dateLabel（口袋卡没有标题）', () => {
    let checked = 0;
    for (const template of BUILTIN_TEMPLATES) {
      for (const paper of ['A4', 'A5'] as const satisfies readonly PaperId[]) {
        const blocks = materialize(paperFor(template.id, paper), CONTEXT);
        const title = blocks.find((block) => block.kind === 'title');
        if (title?.kind !== 'title') continue;
        expect(title.text, `${template.id}/${paper}`).toBe(CONTEXT.dateLabel);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('不修改模板（调用前后深拷贝一致）', () => {
    const template = templateById('day');
    const before = JSON.parse(JSON.stringify(template)) as PrintTemplate;

    materialize(template, CONTEXT);
    materialize(template, { date: '2026-03-06', dateLabel: '2026 年 3 月 6 日' });
    materialize(paperFor('day', 'A5'), CONTEXT);

    expect(template).toEqual(before);
    expect(templateById('day').paper).toBe('A4');
  });

  it('返回新数组与新区块对象，不复用模板引用', () => {
    const template = templateById('day');
    const blocks = materialize(template, CONTEXT);
    expect(blocks).not.toBe(template.blocks);
    expect(blocks.length).toBe(template.blocks.length);
    for (const [index, block] of blocks.entries()) {
      expect(block).not.toBe(template.blocks[index]);
    }
    expect(titleOf(blocks)).not.toBe(titleOf(template.blocks));
  });

  it('嵌套数组也独立，改返回值不会污染模板', () => {
    const template = templateById('day');
    const slots = materialize(template, CONTEXT).find((block) => block.id === 'slots');
    if (slots?.kind !== 'slots') throw new Error('缺少 slots 区块');
    slots.labels.push('额外');

    const original = template.blocks.find((block) => block.id === 'slots');
    if (original?.kind !== 'slots') throw new Error('模板缺少 slots 区块');
    expect(original.labels).toEqual(['睡眠', '心情', '专注']);
  });

  it('区块 id 与顺序和模板一致', () => {
    for (const template of BUILTIN_TEMPLATES) {
      const materialized = materialize(template, CONTEXT);
      expect(materialized.map((block) => block.id)).toEqual(
        template.blocks.map((block) => block.id),
      );
    }
  });
});

describe('模板：paperFor', () => {
  it('返回指定纸张且不改内置常量', () => {
    const a4 = paperFor('day', 'A4');
    const a5 = paperFor('day', 'A5');
    expect(a4.paper).toBe('A4');
    expect(a5.paper).toBe('A5');
    expect(templateById('day').paper).toBe('A4');
    expect(a5.blocks).not.toBe(templateById('day').blocks);
  });

  it('day 在 A4/A5 下行数不同，且可直接 materialize', () => {
    const a4 = materialize(paperFor('day', 'A4'), CONTEXT);
    const a5 = materialize(paperFor('day', 'A5'), CONTEXT);
    expect(taskRowsOf(a4)).toBe(10);
    expect(taskRowsOf(a5)).toBe(4);
    expect(timeLogsOf(a4)[0]?.rows).toBe(2);
    expect(timeLogsOf(a5)[0]?.rows).toBe(1);
  });

  it('未知模板 id 明确抛错，而不是悄悄换模板', () => {
    expect(() => paperFor('does-not-exist', 'A4')).toThrow('未知打印模板');
  });

  it('校准页也能按纸张取版本', () => {
    expect(paperFor('calibration', 'A5').paper).toBe('A5');
  });
});

describe('模板：打印校准页', () => {
  it('能在自己的纸张上排成一页', () => {
    const result = layout(CALIBRATION_TEMPLATE.blocks, { paper: CALIBRATION_TEMPLATE.paper });
    expect(result.dropped).toEqual([]);
    expect(result.pages).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('包含标题、提示、近似刻度与版本占位', () => {
    const title = titleOf(CALIBRATION_TEMPLATE.blocks);
    expect(title.text).toContain('打印校准页');
    expect(title.text).toContain('100%');

    const blocks = CALIBRATION_TEMPLATE.blocks;
    expect(blocks.some((block) => block.kind === 'hintLine')).toBe(true);
    expect(linedBoxesOf(blocks).map((block) => block.label)).toEqual([
      '10mm',
      '20mm',
      '30mm',
      '40mm',
      '50mm',
    ]);

    const footer = blocks.find((block) => block.kind === 'footer');
    if (footer?.kind !== 'footer') throw new Error('缺少 footer 区块');
    expect(footer.text).toContain('GoFor');
    expect(footer.text).toContain('日期');
  });

  it('materialize 保留校准页的固定标题并仍能一页排下', () => {
    const blocks = materialize(CALIBRATION_TEMPLATE, CONTEXT);
    expect(titleOf(blocks).text).toBe('打印校准页 · 请用实际大小（100%）打印');
    expect(layout(blocks, { paper: CALIBRATION_TEMPLATE.paper }).pages).toHaveLength(1);
  });
});
