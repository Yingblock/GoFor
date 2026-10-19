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
  'timeLog',
  'schedule',
  'timestamp',
  'checkboxGrid',
  'ratingGrid',
  'table',
  'slots',
  'linedBox',
  'hintLine',
  'qrcode',
  'habitRow',
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
 * 当日课表。
 *
 * 数据在打印时由调用方算好（`occurrencesOn(today, ...)`），
 * 区块本身只负责版式——打印层不应该依赖课表模型，否则模板就没法复用了。
 */
export interface ScheduleBlock extends BlockBase {
  kind: 'schedule';
  /** 显示几节；多了截断并在末尾标注。 */
  rows: number;
  title: string;
}

/**
 * 当前时间。
 *
 * 打印那一刻的时间戳——用来回答"这张纸是什么时候打出来的"。
 * 版式上只占一行，具体时刻由渲染层在打印时取，区块本身不存值，
 * 否则同一份数据每次打印都会印出旧时间。
 */
export interface TimestampBlock extends BlockBase {
  kind: 'timestamp';
  label: string;
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

/**
 * 睡眠 / 心情 / 专注这类 1–N 的自评格。
 *
 * 与 `slots`（手写数字）的区别：这里**每行打印成 N 个勾选格子**，
 * 扫回来只判断"哪一格有墨迹"，就能直接得到 1–N 的数值——不需要识别手写数字。
 * 行高与 `checkboxGrid` 一致，所以两种格子混排时版式节奏不会突变。
 */
export interface RatingGridBlock extends BlockBase {
  kind: 'ratingGrid';
  /** 每行一项，例如 `['睡眠', '心情', '专注']`。 */
  labels: string[];
  /** 满分（格子数），1 起计。 */
  scale: number;
  /**
   * 与 `labels` 平行的数据键（例如 `sleep` / `mood` / `focus`）。
   * 回填写库时用它把格子映射回数据字段；没有就只按标签展示。
   */
  keys?: string[];
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

/** 打卡行：一行内并排若干个「勾选框 + 习惯名」，扫描时逐格判断有没有墨。 */
export interface HabitRowBlock extends BlockBase {
  kind: 'habitRow';
}

/** 打卡行最多显示几个；再多就截断（纸面一行放不下，硬塞会看不清）。 */
export const HABIT_ROW_MAX = 6;

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
  | TimeLogBlock
  | ScheduleBlock
  | TimestampBlock
  | CheckboxGridBlock
  | RatingGridBlock
  | TableBlock
  | SlotsBlock
  | LinedBoxBlock
  | HintLineBlock
  | QrCodeBlock
  | HabitRowBlock
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
    case 'habitRow':
      // 一行 7mm：与 checkboxList 的行高一致，勾选框有足够书写空间。
      return ROW_HEIGHT_MM;
    case 'checkboxList':
      return BLOCK_PADDING_MM + block.rows * ROW_HEIGHT_MM;
    case 'timeLog':
      return BLOCK_PADDING_MM + block.rows * TIME_LOG_ROW_MM;
    case 'schedule':
      return BLOCK_PADDING_MM + block.rows * ROW_HEIGHT_MM;
    case 'timestamp':
      return BLOCK_PADDING_MM + ROW_HEIGHT_MM;
    case 'checkboxGrid':
      return BLOCK_PADDING_MM + block.rows * CELL_SIZE_MM;
    case 'ratingGrid':
      // 每行高度与 checkboxGrid 一致：一行一项，格子边长 = CELL_SIZE_MM。
      return BLOCK_PADDING_MM + block.labels.length * CELL_SIZE_MM;
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
  if (block.kind === 'ratingGrid') {
    if (!Number.isInteger(block.scale) || block.scale < 1) {
      errors.push(`区块 ${block.id}: scale 必须是 ≥1 的整数`);
    }
    if (block.labels.length === 0) {
      errors.push(`区块 ${block.id}: ratingGrid 至少需要一行`);
    }
  }
  return errors;
}
