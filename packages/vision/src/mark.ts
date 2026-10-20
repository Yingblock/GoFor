/**
 * 找区块小定位点（P2-2.17 v2）：在预期位置附近找一个小十字的质心。
 *
 * 区块之间只有 2mm 行距，小点只有 1.2mm（矫正后约 5–6px），所以不重新做全图检测，
 * 而是在**已知位置附近的小窗口**里找连通域。用尺寸/填充率过滤掉相邻的文字墨迹：
 * 十字的包围盒明显小于正文（2.4mm 字已经 ~11px），填充率也低于实心方块。
 *
 * 纯函数、零平台 API，可在 Node 里确定性测试。
 */

import type { Point } from './types.ts';

export interface FindMarkOptions {
  /** 搜索半径（像素），来自纸张毫米数 × 矫正后的每毫米像素数。 */
  radiusPx: number;
  /** 连通域包围盒的边长范围（像素）；默认按小点大小给一个宽松区间。 */
  minBoxPx?: number;
  maxBoxPx?: number;
  /** 允许的填充率（面积 / 包围盒面积）。十字约 0.4；实心块约 1；文字偏高。 */
  minFill?: number;
  maxFill?: number;
}

const DEFAULTS = {
  minBoxPx: 2,
  maxBoxPx: 12,
  minFill: 0.15,
  maxFill: 0.7,
} as const;

interface Component {
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

/** 在 `center` 附近的窗口里找最像小定位点的连通域，返回其质心；找不到返回 null。 */
export function findMarkNear(
  binary: Uint8Array,
  width: number,
  height: number,
  center: Point,
  options: FindMarkOptions,
): Point | null {
  if (width <= 0 || height <= 0) return null;
  if (binary.length !== width * height) return null;

  const radius = Math.max(1, Math.round(options.radiusPx));
  const left = Math.max(0, Math.floor(center.x) - radius);
  const top = Math.max(0, Math.floor(center.y) - radius);
  const right = Math.min(width - 1, Math.floor(center.x) + radius);
  const bottom = Math.min(height - 1, Math.floor(center.y) + radius);
  const windowWidth = right - left + 1;
  const windowHeight = bottom - top + 1;
  if (windowWidth <= 0 || windowHeight <= 0) return null;

  const minBox = options.minBoxPx ?? DEFAULTS.minBoxPx;
  const maxBox = options.maxBoxPx ?? DEFAULTS.maxBoxPx;
  const minFill = options.minFill ?? DEFAULTS.minFill;
  const maxFill = options.maxFill ?? DEFAULTS.maxFill;

  const visited = new Uint8Array(windowWidth * windowHeight);
  const queue = new Int32Array(windowWidth * windowHeight);
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let wy = 0; wy < windowHeight; wy += 1) {
    for (let wx = 0; wx < windowWidth; wx += 1) {
      const start = wy * windowWidth + wx;
      if (visited[start] === 1) continue;
      const globalIndex = (top + wy) * width + (left + wx);
      if (binary[globalIndex] !== 1) {
        visited[start] = 1;
        continue;
      }

      let head = 0;
      let tail = 0;
      queue[tail] = start;
      tail += 1;
      visited[start] = 1;
      const component: Component = {
        area: 0,
        minX: wx,
        maxX: wx,
        minY: wy,
        maxY: wy,
        sumX: 0,
        sumY: 0,
      };

      while (head < tail) {
        const index = queue[head] ?? 0;
        head += 1;
        const x = index % windowWidth;
        const y = (index - x) / windowWidth;
        component.area += 1;
        component.sumX += x;
        component.sumY += y;
        if (x < component.minX) component.minX = x;
        if (x > component.maxX) component.maxX = x;
        if (y < component.minY) component.minY = y;
        if (y > component.maxY) component.maxY = y;

        for (const next of [index - 1, index + 1, index - windowWidth, index + windowWidth]) {
          if (next < 0 || next >= windowWidth * windowHeight) continue;
          if (visited[next] === 1) continue;
          const nextX = next % windowWidth;
          const nextY = (next - nextX) / windowWidth;
          if (Math.abs(nextX - x) + Math.abs(nextY - y) !== 1) continue;
          const nextGlobal = (top + nextY) * width + (left + nextX);
          if (binary[nextGlobal] !== 1) continue;
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      const boxWidth = component.maxX - component.minX + 1;
      const boxHeight = component.maxY - component.minY + 1;
      if (boxWidth < minBox || boxHeight < minBox) continue;
      if (boxWidth > maxBox || boxHeight > maxBox) continue;
      const aspect = boxWidth / boxHeight;
      if (aspect < 0.4 || aspect > 2.5) continue;
      const fill = component.area / (boxWidth * boxHeight);
      if (fill < minFill || fill > maxFill) continue;

      const centroid: Point = {
        x: left + component.sumX / component.area,
        y: top + component.sumY / component.area,
      };
      const distance = Math.hypot(centroid.x - center.x, centroid.y - center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = centroid;
      }
    }
  }

  return best;
}
