import type { Point, Quad } from './types.ts';
import { identityQuad } from './warp.ts';

/**
 * 角点检测在降采样网格上做：4000×3000 的照片也只扫描 ~512×512 个格子，
 * 成本与像素总数无关，并且所有循环都有界（不依赖随机/浮点收敛）。
 */
const MAX_GRID_SIDE = 512;
/** 纸占满整帧（几乎全是纸色）时，直接把整图当成纸。 */
const PAGE_FILLS_FRAME = 0.995;
/** 连通域至少要占整帧的一小部分，否则视为噪点。 */
const MIN_PAGE_AREA_RATIO = 0.005;
const MIN_PAGE_AREA_CELLS = 8;

interface Candidate {
  quad: Quad;
  area: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 网格坐标 → 源图像素坐标（格子左上角），钳制在页内。 */
function toSource(
  cellX: number,
  cellY: number,
  step: number,
  width: number,
  height: number,
): Point {
  return {
    x: clamp(cellX * step, 0, width - 1),
    y: clamp(cellY * step, 0, height - 1),
  };
}

function quadArea(quad: Quad): number {
  const [p0, p1, p2, p3] = quad;
  const twice =
    p0.x * p1.y -
    p1.x * p0.y +
    (p1.x * p2.y - p2.x * p1.y) +
    (p2.x * p3.y - p3.x * p2.y) +
    (p3.x * p0.y - p0.x * p3.y);
  return Math.abs(twice) / 2;
}

/**
 * 在一张二值图里找「纸」的外轮廓并用最小外接四边形近似（用于自动找角点）。
 * 找不到返回 null。允许失败——调用方还会提供手动四角兜底。
 *
 * 做法（全部有界迭代）：
 * 1. 按 `MAX_GRID_SIDE` 降采样成网格，格子中心是纸（binary = 0）就标 1；
 * 2. 对网格做一遍连通域标记（显式栈的洪水填充，不用递归）；
 * 3. 取最大连通域，用四个方向的支撑点近似四角：
 *    min(x+y) → 左上，max(x-y) → 右上，max(x+y) → 右下，min(x-y) → 左下；
 * 4. 面积/形状不合理时返回 null。
 *
 * 注意这是**粗定位**：它假设纸是画面里最大的浅色凸区域。
 */
export function detectPageQuad(binary: Uint8Array, width: number, height: number): Quad | null {
  const w = Math.trunc(width);
  const h = Math.trunc(height);
  if (w <= 0 || h <= 0) return null;

  const step = Math.max(1, Math.ceil(Math.max(w, h) / MAX_GRID_SIDE));
  const gridWidth = Math.ceil(w / step);
  const gridHeight = Math.ceil(h / step);
  const cellCount = gridWidth * gridHeight;

  // 1. 降采样：1 = 纸，0 = 墨迹/背景。
  const paper = new Uint8Array(cellCount);
  const sampleOffset = Math.floor(step / 2);
  let paperCount = 0;
  for (let cellY = 0; cellY < gridHeight; cellY += 1) {
    const sourceY = Math.min(h - 1, cellY * step + sampleOffset);
    for (let cellX = 0; cellX < gridWidth; cellX += 1) {
      const sourceX = Math.min(w - 1, cellX * step + sampleOffset);
      if ((binary[sourceY * w + sourceX] ?? 1) === 0) {
        paper[cellY * gridWidth + cellX] = 1;
        paperCount += 1;
      }
    }
  }

  if (paperCount === 0) return null;
  if (paperCount / cellCount >= PAGE_FILLS_FRAME) return identityQuad(w, h);

  // 2. 连通域标记（显式栈，4 邻接）。
  const visited = new Uint8Array(cellCount);
  const stack = new Int32Array(cellCount);
  const minArea = Math.max(MIN_PAGE_AREA_CELLS, Math.floor(cellCount * MIN_PAGE_AREA_RATIO));
  let best: Candidate | null = null;

  for (let seed = 0; seed < cellCount; seed += 1) {
    if (paper[seed] === 0 || visited[seed] === 1) continue;

    let stackTop = 0;
    stack[stackTop] = seed;
    stackTop += 1;
    visited[seed] = 1;

    let area = 0;
    let minSum = Number.POSITIVE_INFINITY;
    let maxSum = Number.NEGATIVE_INFINITY;
    let minDiff = Number.POSITIVE_INFINITY;
    let maxDiff = Number.NEGATIVE_INFINITY;
    let topLeft: Point = { x: 0, y: 0 };
    let topRight: Point = { x: 0, y: 0 };
    let bottomRight: Point = { x: 0, y: 0 };
    let bottomLeft: Point = { x: 0, y: 0 };

    while (stackTop > 0) {
      stackTop -= 1;
      const cell = stack[stackTop] ?? 0;
      const cellX = cell % gridWidth;
      const cellY = (cell - cellX) / gridWidth;
      area += 1;

      const sum = cellX + cellY;
      const diff = cellX - cellY;
      if (sum < minSum) {
        minSum = sum;
        topLeft = { x: cellX, y: cellY };
      }
      if (sum > maxSum) {
        maxSum = sum;
        bottomRight = { x: cellX, y: cellY };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        topRight = { x: cellX, y: cellY };
      }
      if (diff < minDiff) {
        minDiff = diff;
        bottomLeft = { x: cellX, y: cellY };
      }

      const neighbors = [
        cellX > 0 ? cell - 1 : -1,
        cellX + 1 < gridWidth ? cell + 1 : -1,
        cellY > 0 ? cell - gridWidth : -1,
        cellY + 1 < gridHeight ? cell + gridWidth : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0) continue;
        if (paper[neighbor] === 0 || visited[neighbor] === 1) continue;
        visited[neighbor] = 1;
        stack[stackTop] = neighbor;
        stackTop += 1;
      }
    }

    if (area < minArea) continue;

    const gridQuad: Quad = [topLeft, topRight, bottomRight, bottomLeft];
    // 网格尺度上也要有像样的面积，否则是「一条细线」而不是纸。
    if (quadArea(gridQuad) < 4) continue;

    const quad: Quad = [
      toSource(topLeft.x, topLeft.y, step, w, h),
      toSource(topRight.x, topRight.y, step, w, h),
      toSource(bottomRight.x, bottomRight.y, step, w, h),
      toSource(bottomLeft.x, bottomLeft.y, step, w, h),
    ];

    if (!best || area > best.area) {
      best = { quad, area };
    }
  }

  return best ? best.quad : null;
}
