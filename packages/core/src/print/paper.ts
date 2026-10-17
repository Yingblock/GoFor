/**
 * 纸张与版式网格。
 *
 * 所有尺寸一律用 **毫米**，不用像素。
 * 原因：打印是物理尺寸问题，1mm 在屏幕上多少 px 取决于 DPI，
 * 而浏览器对 CSS 的 `mm` 支持是可靠的。用 px 排版必然在别人的打印机上跑偏。
 */

/** 纸张标识。与配置里的 `print.paper` 共用同一份常量，避免两处枚举漂移。 */
export const PAPER_IDS = ['A4', 'A5', 'B5', 'index-card', 'sticker-50x30'] as const;
export type PaperId = (typeof PAPER_IDS)[number];

export interface PaperSize {
  id: PaperId;
  name: string;
  /** 短边。 */
  widthMm: number;
  /** 长边。 */
  heightMm: number;
}

export const PAPER_SIZES: Record<PaperId, PaperSize> = {
  A4: { id: 'A4', name: 'A4', widthMm: 210, heightMm: 297 },
  A5: { id: 'A5', name: 'A5', widthMm: 148, heightMm: 210 },
  B5: { id: 'B5', name: 'B5', widthMm: 176, heightMm: 250 },
  'index-card': { id: 'index-card', name: '索引卡 (3×5 in)', widthMm: 76.2, heightMm: 127 },
  'sticker-50x30': { id: 'sticker-50x30', name: '标签 50×30', widthMm: 50, heightMm: 30 },
};

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 默认页边距。
 * 家用打印机的不可打印边通常 4–5mm，学校打印机更糟，所以留 8mm 而不是 0。
 */
export const DEFAULT_MARGIN: Margin = { top: 8, right: 8, bottom: 8, left: 8 };

export interface Box {
  widthMm: number;
  heightMm: number;
}

/** 页面可用区域（扣除页边距）。横向纸张时调用方自行交换宽高。 */
export function contentBox(paper: PaperSize, margin: Margin = DEFAULT_MARGIN): Box {
  return {
    widthMm: paper.widthMm - margin.left - margin.right,
    heightMm: paper.heightMm - margin.top - margin.bottom,
  };
}

/** 版式网格列数。12 列足够表达整行 / 半行 / 三分 / 四分。 */
export const GRID_COLUMNS = 12;

/** 每一列在给定内容宽度下的实际毫米数。 */
export function columnWidthMm(contentWidthMm: number, columns: number = GRID_COLUMNS): number {
  if (columns <= 0) throw new RangeError('columns 必须为正');
  return contentWidthMm / columns;
}

/** 行与行之间的垂直间距。 */
export const ROW_GAP_MM = 2;
