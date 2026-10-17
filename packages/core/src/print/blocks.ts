/**
 * 打印模板的区块定义。
 *
 * 设计前提：**区块高度必须是确定的**，不做自动撑开。
 * 纸张尺寸固定，自动撑开会把分页变成不可预测的运行时测量，
 * 而"预览里好好的，打出来错位"是最打击信任的失败。所以：
 *
 *   高度 = 行高 × 行数 + 内边距
 *
 * 行数是模板里的显式参数，不是从数据推出来的。数据多了就缩字号或提示截断，
 * 而不是悄悄把版面撑破。
 */

export const BLOCK_KINDS = [
  'title',
  'checkboxList',
  'focusGrid',
  'timeLog',
  'checkboxGrid',
  'table',
  'slots',
  'linedBox',
  'hintLine',
  'qrcode',
  'progressDots',
  'footer',
  'pageBreak',
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

/** 书写行高（毫米）。约等于正常手写一行的高度。 */
export const ROW_HEIGHT_MM = 7;
/** 时间登记行需要更多空间（要写"做了什么"+两组时间）。 */
export const TIME_LOG_ROW_MM = 11;
/** 专注格的方格边长。 */
export const CELL_SIZE_MM = 7;
/** 区块标题/内边距占用的固定高度。 */
const BLOCK_PADDING_MM = 8;

export interface BlockBase {
  /** 模板内唯一，用于稳定排序与命中测试。 */
  id: string;
  kind: BlockKind;
  /** 横向跨度，1–12 列。整行 = 12。 */
  span: number;
}

export interface TitleBlock extends BlockBase {
  kind: 'title';
  text: string;
  align: 'left' | 'center';
}

export interface CheckboxListBlock extends BlockBase {
  kind: 'checkboxList';
  /** 数据来源，例如 'tasks.today'。 */
  bind: string;
  /** 显式行数，决定高度。 */
  rows: number;
  showMeta: ('subject' | 'due')[];
}

/**
 * 专注格：行 = 科目，列 = 专注单元。
 * 不预印格子数由课表推导，而是模板里写死 `cells`，保证高度确定。
 */
export interface FocusGridBlock extends BlockBase {
  kind: 'focusGrid';
  bind: string;
  rows: number;
  cells: number;
  /** 一个格子代表多少分钟；'period' 表示跟随作息表（见配置层）。 */
  unitMinutes: 'period' | number;
}

/** 时间登记：写在纸上再解析，见 `paper/timeRange.ts`。 */
export interface TimeLogBlock extends BlockBase {
  kind: 'timeLog';
  /** 分栏标题即 DayPart，用来消除「7:30」是上午还是晚上的歧义。 */
  dayPart: 'morning' | 'afternoon' | 'evening';
  rows: number;
  label: string;
}

/** 习惯打卡格。 */
export interface CheckboxGridBlock extends BlockBase {
  kind: 'checkboxGrid';
  cols: number;
  rows: number;
}

/** 课表之类的表格。 */
export interface TableBlock extends BlockBase {
  kind: 'table';
  bind: string;
  rows: number;
  headers: string[];
}

/** 睡眠 / 心情 / 专注 三个手写小格。 */
export interface SlotsBlock extends BlockBase {
  kind: 'slots';
  labels: string[];
}

/** 手写留白区。 */
export interface LinedBoxBlock extends BlockBase {
  kind: 'linedBox';
  label: string;
  lines: number;
}

/** 书写提示行，例如「深色笔 · 不出框 · 不连笔」。 */
export interface HintLineBlock extends BlockBase {
  kind: 'hintLine';
  text: string;
}

export interface QrCodeBlock extends BlockBase {
  kind: 'qrcode';
  /** 边长（毫米）。 */
  sizeMm: number;
}

export interface ProgressDotsBlock extends BlockBase {
  kind: 'progressDots';
  total: number;
}

export interface FooterBlock extends BlockBase {
  kind: 'footer';
  text: string;
}

/** 强制换页。 */
export interface PageBreakBlock extends BlockBase {
  kind: 'pageBreak';
}

export type Block =
  | TitleBlock
  | CheckboxListBlock
  | FocusGridBlock
  | TimeLogBlock
  | CheckboxGridBlock
  | TableBlock
  | SlotsBlock
  | LinedBoxBlock
  | HintLineBlock
  | QrCodeBlock
  | ProgressDotsBlock
  | FooterBlock
  | PageBreakBlock;

/** 区块的固定高度（毫米），不含行间距。 */
export function blockHeightMm(block: Block): number {
  switch (block.kind) {
    case 'title':
      return 10;
    case 'hintLine':
    case 'footer':
      return 6;
    case 'pageBreak':
      return 0;
    case 'progressDots':
      return 10;
    case 'slots':
      return 14;
    case 'qrcode':
      return block.sizeMm;
    case 'checkboxList':
      return BLOCK_PADDING_MM + block.rows * ROW_HEIGHT_MM;
    case 'focusGrid':
      return BLOCK_PADDING_MM + block.rows * CELL_SIZE_MM;
    case 'timeLog':
      return BLOCK_PADDING_MM + block.rows * TIME_LOG_ROW_MM;
    case 'checkboxGrid':
      return BLOCK_PADDING_MM + block.rows * CELL_SIZE_MM;
    case 'table':
      return BLOCK_PADDING_MM + block.rows * ROW_HEIGHT_MM;
    case 'linedBox':
      return BLOCK_PADDING_MM + block.lines * ROW_HEIGHT_MM;
  }
}

/** 校验区块是否合法；返回错误列表，空数组表示没问题。 */
export function validateBlock(block: Block): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(block.span) || block.span < 1 || block.span > 12) {
    errors.push(`区块 ${block.id}: span 必须是 1–12 的整数`);
  }
  if (blockHeightMm(block) < 0) {
    errors.push(`区块 ${block.id}: 高度不能为负`);
  }
  if ('rows' in block && (!Number.isInteger(block.rows) || block.rows < 0)) {
    errors.push(`区块 ${block.id}: rows 必须是非负整数`);
  }
  return errors;
}
