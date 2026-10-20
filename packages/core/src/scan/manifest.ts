/**
 * 模板坐标注册表（P2-2.3）：把"纸上印了什么"变成"扫回来去哪儿采样"。
 *
 * 核心洞察（DESIGN §3.1）：模板是我们自己生成的，所以**每个格子的坐标已知**。
 * 于是识别问题从"认出手写勾"降级为"在已知小矩形里判断有没有墨迹"，
 * 不需要 OCR，也不需要分类器。
 *
 * 坐标系：归一化 0–1，原点在**整页**左上角（含页边距），
 * 与扫描分辨率无关；拍照后先按二维码/fiducial 做透视矫正，再乘这个坐标即可。
 * 注意不是"内容区坐标"——页边距在拍照时会一起进画面，用整页坐标才不会整体偏移。
 */

import {
  type Block,
  blockHeightMm,
  blockMarkCenters,
  type CheckboxGridBlock,
  type CheckboxListBlock,
  fiducialBottomTopMm,
  type HabitRowBlock,
  habitRowLayout,
  type RatingGridBlock,
  ROW_HEIGHT_MM,
} from '../print/blocks.ts';
import { layout, normalizePlacement, type PageLayout, type Placement } from '../print/layout.ts';
import type { PaperId } from '../print/paper.ts';

/** 一个可回填的格子。 */
export interface ScanTarget {
  /** 例如 `${block.id}/r2` 或 `${block.id}/r1c3`。 */
  targetId: string;
  kind: 'checkbox' | 'cell' | 'slider';
  /** 给人看：'数学卷子 3.1' / '睡眠 4 分'。 */
  label: string;
  /** 归一化 0–1，整页坐标。 */
  rect: { x: number; y: number; w: number; h: number };
  /**
   * 关联的数据 id（任务 id 等），没有就是 null。
   * 原样来自 `bindings` / `keys`，不在这里拼写库前缀（见 `applyPayload`）。
   */
  payload: string | null;
  /** ratingGrid 的取值（1 起）。 */
  value?: number;
  /**
   * 写库载荷，遵循 `@gofor/core/domain` 的 `ScanResult.payload` 约定：
   * `task:<任务id>` / `habit:<习惯id>` / `mood:<sleep|mood|focus>`。
   *
   * 与 `payload` 分开是因为两层语义不同：`payload` 是"这一格对应哪条数据"，
   * `applyPayload` 是"写回时用什么格式"。`classifyInk` 优先用它填 `ScanResult.payload`。
   */
  applyPayload?: string | null;
  /** 这一格属于哪个区块：扫描时按区块小定位点做局部校正（见 `blocks`）。 */
  blockId?: string;
}

/**
 * 一个区块在页面上的位置（归一化 0–1）与它的两个小定位点中心。
 *
 * 小点是打印时额外印在行距里的十字（`blockMarkCenters`），扫描矫正后用它把
 * 这一块的采样窗再对齐一次——页面级透视矫正解决不了纸张局部拉伸/起翘。
 */
export interface ManifestBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  marks: {
    top: { x: number; y: number };
    bottom: { x: number; y: number };
  };
}

export interface SheetManifest {
  /** 注册表格式版本。模板/坐标含义改了必须升版本，旧纸才不会被误读。 */
  version: 1;
  templateId: string;
  /** 纸上印的日期（来自二维码），不是扫描发生的时间。 */
  date: string;
  paper: string;
  pages: {
    index: number;
    widthMm: number;
    heightMm: number;
    targets: ScanTarget[];
    /** 旧清单没有这个字段（旧纸也没印小点）：缺省时扫描不做区块级校正。 */
    blocks?: ManifestBlock[];
    /**
     * 这一页下方定位块的顶部纵坐标（mm）。
     * 下方定位点跟着正文底部/页脚安全线走，扫描端必须按它计算底部内缩；
     * 旧清单没有这个字段 → 回退到旧的对称几何。
     */
    fiducialBottomTopMm?: number;
  }[];
}

export interface ManifestInput {
  templateId: string;
  date: string;
  paper: PaperId;
  blocks: Block[];
  /** bind 名 → 该 bind 对应的 id 列表（按打印时的顺序），用于把第 N 行映射回任务 id。 */
  bindings?: Record<string, string[]>;
  /** 行标签来源，例如 checkboxList 的第 i 行显示什么。 */
  labels?: Record<string, string[]>;
}

/**
 * 生成坐标注册表。
 *
 * 支持的区块与切分方式：
 * - `checkboxList`：按 `rows` 等分，一行一个 `checkbox`；
 * - `checkboxGrid`：`rows × cols`，一格一个 `cell`（行优先）；
 * - `ratingGrid`：`labels.length × scale`，一格一个 `slider`，值 = 列号 + 1。
 *
 * 其它区块跳过（原因见 `buildTargets` 的 switch 注释）：
 * 它们要么是纯印刷/装饰，要么是"手写自由内容"，坐标先验判断不了语义。
 */
export function buildSheetManifest(input: ManifestInput): SheetManifest {
  const result = layout(input.blocks, { paper: input.paper });
  return {
    version: 1,
    templateId: input.templateId,
    date: input.date,
    paper: input.paper,
    pages: result.pages.map((page) => {
      const blocks = page.placements.map((placement) => {
        const rect = normalizePlacement(placement, page);
        const centers = blockMarkCenters(placement);
        return {
          id: placement.block.id,
          ...rect,
          marks: {
            top: { x: centers.top.x / page.widthMm, y: centers.top.y / page.heightMm },
            bottom: { x: centers.bottom.x / page.widthMm, y: centers.bottom.y / page.heightMm },
          },
        };
      });
      const contentBottomMm = Math.max(
        0,
        ...page.placements.map((placement) => placement.yMm + placement.heightMm),
      );
      return {
        index: page.index,
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        blocks,
        fiducialBottomTopMm: fiducialBottomTopMm(contentBottomMm, page.heightMm),
        targets: page.placements.flatMap((placement) =>
          buildTargets(placement, page, input).map((target) => ({
            ...target,
            blockId: placement.block.id,
          })),
        ),
      };
    }),
  };
}

function buildTargets(placement: Placement, page: PageLayout, input: ManifestInput): ScanTarget[] {
  const block = placement.block;
  const rect = normalizePlacement(placement, page);

  switch (block.kind) {
    case 'checkboxList':
      return checkboxListTargets(block, rect, page, input);
    case 'checkboxGrid':
      return checkboxGridTargets(block, rect);
    case 'ratingGrid':
      return ratingGridTargets(block, rect);
    case 'habitRow':
      return habitRowTargets(block, placement, page, input);
    /*
     * 其余 kind 故意不产生 target：
     * - `timeLog`：格子里是手写的时间区间（如「19:30–20:10」），
     *   坐标先验只能判断"有没有墨迹"，读不出起止时刻，需要手写识别/OCR（P3 以后）；
     * - `slots`：睡眠/心情/专注是**手写数字**，墨迹占比无法映射到 1–5；
     *   P2 用 `ratingGrid`（印成勾选格）取代，勾选位置就是数值；
     * - `schedule` / `table`：印刷表格，格子里是打印的内容，不是手写；
     *   先验采样只会读到印刷字，反而把"有内容"误判成"已勾选"；
     * - `title` / `hintLine` / `footer` / `timestamp` / `progressDots` / `qrcode` / `pageBreak`：
     *   纯印刷、装饰或分页，没有可回填的东西；
     * - `linedBox`：整块自由书写，没有"格子"语义，读回来也落不到某条数据上。
     */
    default:
      return [];
  }
}

function checkboxListTargets(
  block: CheckboxListBlock,
  rect: { x: number; y: number; w: number; h: number },
  page: PageLayout,
  input: ManifestInput,
): ScanTarget[] {
  if (block.rows <= 0) return [];
  const boundIds = input.bindings?.[block.bind];
  const rowLabels = input.labels?.[block.bind];
  const targets: ScanTarget[] = [];
  const content = rowsContentRect(block, rect, block.rows);
  for (let index = 0; index < block.rows; index += 1) {
    const cell = cellRect(content, block.rows, 1, index, 0);
    const rawId = boundIds?.[index] ?? null;
    targets.push({
      targetId: `${block.id}/r${index + 1}`,
      kind: 'checkbox',
      label: rowLabels?.[index] ?? `第 ${index + 1} 行`,
      // 只采勾选框那一小块（5mm），不把整行的印刷标题算进墨迹——
      // 印刷字会抬高空白行的 ink，导致"没勾"被读成"勾了"。
      rect: { ...cell, w: Math.min(cell.w, 5 / page.widthMm) },
      payload: rawId,
      applyPayload: rawId === null ? null : applyPayloadFor(block.bind, rawId),
    });
  }
  return targets;
}

function checkboxGridTargets(
  block: CheckboxGridBlock,
  rect: { x: number; y: number; w: number; h: number },
): ScanTarget[] {
  // checkboxGrid 没有 bind 字段：格子与数据的映射由调用方在确认列表里做，
  // 这里只提供坐标与行列语义。
  if (block.rows <= 0 || block.cols <= 0) return [];
  const targets: ScanTarget[] = [];
  for (let row = 0; row < block.rows; row += 1) {
    for (let col = 0; col < block.cols; col += 1) {
      targets.push({
        targetId: `${block.id}/r${row + 1}c${col + 1}`,
        kind: 'cell',
        label: `第 ${row + 1} 行第 ${col + 1} 列`,
        rect: cellRect(rect, block.rows, block.cols, row, col),
        payload: null,
        applyPayload: null,
      });
    }
  }
  return targets;
}

function ratingGridTargets(
  block: RatingGridBlock,
  rect: { x: number; y: number; w: number; h: number },
): ScanTarget[] {
  const rows = block.labels.length;
  if (rows <= 0 || block.scale <= 0) return [];
  const targets: ScanTarget[] = [];
  const content = rowsContentRect(block, rect, rows);
  for (let row = 0; row < rows; row += 1) {
    const rowLabel = block.labels[row] ?? `第 ${row + 1} 行`;
    const key = block.keys?.[row] ?? null;
    for (let col = 0; col < block.scale; col += 1) {
      const value = col + 1;
      targets.push({
        targetId: `${block.id}/r${row + 1}c${col + 1}`,
        kind: 'slider',
        label: `${rowLabel} ${value} 分`,
        rect: cellRect(content, rows, block.scale, row, col),
        // 同一行的 scale 个格子共用一个数据键：扫到哪一格，值就是列号 + 1。
        payload: key,
        applyPayload: key === null ? null : moodPayload(key),
        value,
      });
    }
  }
  return targets;
}

/**
 * 打卡行：并排若干「勾选框 + 习惯名」，打卡项多时换行。
 *
 * 采样窗只覆盖**勾选框那一小块**（5mm 宽），不覆盖习惯名：名字是印刷字，
 * 把它算进采样窗会让"没勾"的格子也带上墨迹。渲染端也按这个约定画
 * （见 `PrintSheet` 的 `HabitRowView`），两边共用 `habitRowLayout` 分行，
 * 每行内部等宽，行高 7mm 从块顶开始——任何一边改了都必须同步另一边。
 */
function habitRowTargets(
  block: HabitRowBlock,
  placement: Placement,
  page: PageLayout,
  input: ManifestInput,
): ScanTarget[] {
  const boundIds = input.bindings?.['habits.today'] ?? [];
  const labels = input.labels?.['habits.today'] ?? [];
  const rowSizes = habitRowLayout(boundIds.length);
  if (rowSizes.length === 0) return [];

  const targets: ScanTarget[] = [];
  let index = 0;
  rowSizes.forEach((size, rowIndex) => {
    const cellWidthMm = placement.widthMm / size;
    for (let column = 0; column < size; column += 1) {
      const rawId = boundIds[index];
      index += 1;
      if (rawId === undefined) continue;
      targets.push({
        targetId: `${block.id}/h${rowIndex + 1}c${column + 1}`,
        kind: 'checkbox',
        label: labels[index - 1] ?? `打卡 ${index}`,
        rect: {
          x: (placement.xMm + column * cellWidthMm) / page.widthMm,
          y: (placement.yMm + rowIndex * ROW_HEIGHT_MM) / page.heightMm,
          w: Math.min(5, cellWidthMm) / page.widthMm,
          h: ROW_HEIGHT_MM / page.heightMm,
        },
        payload: rawId,
        applyPayload: applyPayloadFor('habits.today', rawId),
      });
    }
  });
  return targets;
}

/** 把一个矩形均分成 rows × cols 格，返回第 row/col 格。 */
/**
 * 块内"真正承载内容"的区域。
 *
 * 区块高度是 `BLOCK_PADDING_MM + rows × 行高`，但渲染时行是从块顶开始铺的
 * （见 `PrintSheet` 的 checkboxList / ratingGrid），下面的 8mm 是空白。
 * 如果按整个块高等分采样窗，越靠下的行偏得越多，最后一行可能整格错位。
 * 所以按 `rows × 行高 / 块高` 收缩，和渲染保持一致。
 */
function rowsContentRect(
  block: { kind: string },
  rect: { x: number; y: number; w: number; h: number },
  rows: number,
): { x: number; y: number; w: number; h: number } {
  const total = blockHeightMm(block as never);
  if (rows <= 0 || total <= 0) return rect;
  const ratio = Math.min(1, (rows * ROW_HEIGHT_MM) / total);
  return { ...rect, h: rect.h * ratio };
}

function cellRect(
  rect: { x: number; y: number; w: number; h: number },
  rows: number,
  cols: number,
  row: number,
  col: number,
): { x: number; y: number; w: number; h: number } {
  const cellWidth = rect.w / cols;
  const cellHeight = rect.h / rows;
  return {
    x: rect.x + col * cellWidth,
    y: rect.y + row * cellHeight,
    w: cellWidth,
    h: cellHeight,
  };
}

/**
 * 按 bind 名推断写库前缀：`tasks.*` → `task:`、`habits.*` → `habit:`。
 *
 * 为什么需要推断：`bindings` 里是裸 id，而写库层（`applyScanResults`）要带类别前缀，
 * 否则同一个 id 分不清是任务还是习惯。bind 名是模板里唯一稳定的类别来源。
 * 认不出的 bind 原样返回：信息不丢，写库层会安全跳过。
 */
function applyPayloadFor(bind: string, rawId: string): string {
  if (/^(task|habit|mood):.+/.test(rawId)) return rawId;
  const root = bind.toLowerCase().split(/[.:]/)[0] ?? '';
  if (root === 'tasks' || root === 'task') return `task:${rawId}`;
  if (root === 'habits' || root === 'habit') return `habit:${rawId}`;
  return rawId;
}

/** ratingGrid 的行键（sleep/mood/focus）→ 写库载荷 `mood:<key>`。 */
function moodPayload(key: string): string {
  if (/^(task|habit|mood):.+/.test(key)) return key;
  return `mood:${key}`;
}
