/**
 * 版式引擎：把区块列表排成若干页的绝对坐标。
 *
 * 纯算术，不做 DOM 测量。这是刻意选择：
 * - 打印必须确定性，不能依赖"渲染完再量"
 * - 纯函数可以在测试里断言具体毫米数
 * - 同一套结果既能生成 HTML/CSS，也能生成回填识别用的坐标元数据
 */

import { type Block, blockHeightMm, validateBlock } from './blocks.ts';
import {
  columnWidthMm,
  contentBox,
  DEFAULT_MARGIN,
  GRID_COLUMNS,
  type Margin,
  PAPER_SIZES,
  type PaperId,
  type PaperSize,
  ROW_GAP_MM,
} from './paper.ts';

export interface Placement {
  block: Block;
  /** 相对页面左上角（含页边距）的毫米坐标。 */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PageLayout {
  index: number;
  widthMm: number;
  heightMm: number;
  placements: Placement[];
}

export interface LayoutResult {
  pages: PageLayout[];
  /** 无法排入的区块 id（例如单块高于整页可用高度）。 */
  dropped: string[];
  warnings: string[];
}

export interface LayoutOptions {
  paper: PaperId | PaperSize;
  margin?: Margin;
  /** 内容宽度（毫米）；不传则由纸张与页边距算出。 */
  contentWidthMm?: number;
  columns?: number;
}

function resolvePaper(paper: PaperId | PaperSize): PaperSize {
  return typeof paper === 'string' ? PAPER_SIZES[paper] : paper;
}

/**
 * 排版。
 *
 * 规则：
 * 1. 区块按声明顺序流式排布，横向按 `span` 分列；当前行放不下就换行。
 * 2. 同一行的高度取该行内最高的区块。
 * 3. 超出一页可用高度就自动换页；`pageBreak` 区块强制换页。
 * 4. 单个区块高于整页可用高度时，记入 `dropped` 并告警——
 *    宁可明确报错，也不要偷偷裁掉半块。
 */
export function layout(blocks: readonly Block[], options: LayoutOptions): LayoutResult {
  const paper = resolvePaper(options.paper);
  const margin = options.margin ?? DEFAULT_MARGIN;
  const box = contentBox(paper, margin);
  const contentWidthMm = options.contentWidthMm ?? box.widthMm;
  const contentHeightMm = box.heightMm;
  const columns = options.columns ?? GRID_COLUMNS;
  const colWidth = columnWidthMm(contentWidthMm, columns);

  const warnings: string[] = [];
  const dropped: string[] = [];

  for (const block of blocks) {
    for (const message of validateBlock(block)) warnings.push(message);
  }

  const pages: PageLayout[] = [];
  let current: PageLayout = newPage(0, paper);
  let cursorY = 0;
  let cursorX = 0;
  let rowHeight = 0;

  const pushPage = () => {
    pages.push(current);
    current = newPage(pages.length, paper);
    cursorY = 0;
    cursorX = 0;
    rowHeight = 0;
  };

  const flushRow = () => {
    if (rowHeight === 0) return;
    cursorY += rowHeight + ROW_GAP_MM;
    cursorX = 0;
    rowHeight = 0;
  };

  for (const block of blocks) {
    if (block.kind === 'pageBreak') {
      // 已经在本页开头就忽略，避免出现空白页
      if (current.placements.length > 0) pushPage();
      continue;
    }

    const heightMm = blockHeightMm(block);
    const widthMm = colWidth * block.span;

    if (heightMm > contentHeightMm) {
      dropped.push(block.id);
      warnings.push(`区块 ${block.id} 高于整页可用高度（${heightMm}mm > ${contentHeightMm}mm）`);
      continue;
    }

    // 横向放不下 → 换行
    if (cursorX + widthMm > contentWidthMm + 1e-6) {
      flushRow();
    }

    // 纵向放不下 → 换页
    if (cursorY + heightMm > contentHeightMm + 1e-6) {
      flushRow();
      cursorY = 0;
      pushPage();
    }

    current.placements.push({
      block,
      xMm: margin.left + cursorX,
      yMm: margin.top + cursorY,
      widthMm,
      heightMm,
    });

    cursorX += widthMm;
    rowHeight = Math.max(rowHeight, heightMm);
  }

  pages.push(current);

  return { pages, dropped, warnings };
}

function newPage(index: number, paper: PaperSize): PageLayout {
  return { index, widthMm: paper.widthMm, heightMm: paper.heightMm, placements: [] };
}

/** 是否所有区块都能放进一页（不含分页产生的额外页）。 */
export function fitsOnePage(blocks: readonly Block[], options: LayoutOptions): boolean {
  const result = layout(blocks, options);
  return result.pages.length === 1 && result.dropped.length === 0;
}

/**
 * 归一化坐标（0–1）。
 *
 * 回填识别需要的是这个：**与扫描分辨率无关**，
 * 拍照后按 fiducial 角标做透视变换，再乘归一化坐标就能定位每个格子。
 */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizePlacement(placement: Placement, page: PageLayout): NormalizedRect {
  return {
    x: placement.xMm / page.widthMm,
    y: placement.yMm / page.heightMm,
    w: placement.widthMm / page.widthMm,
    h: placement.heightMm / page.heightMm,
  };
}
