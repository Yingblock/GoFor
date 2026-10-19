import type { Point, Quad } from './types.ts';

/**
 * 找纸面四角的定位块（fiducial，P2-2.17 第一步）。
 *
 * 打印时在每页四角印 3mm 的黑方块；拍照后这里从二值图里找四个「近似正方形」的
 * 连通域，用它们的中心当纸张四角。相比自动找纸（detectPageQuad）的优势是
 * **不依赖背景/阴影**：只要四个小方块还在画面里就能定位。
 *
 * 纯函数：输入二值图（1 = 墨迹），输出 TL/TR/BR/BL 顺序的四边形中心；
 * 候选不足/形状不对/四边形面积太小都返回 null，调用方回退手动四角。
 */

export interface FiducialOptions {
  /** 短边的最小/最大边长比例：3mm 在 210mm 纸上约 1.4%，这里留 0.3%–3% 余量。 */
  minSizeRatio?: number;
  maxSizeRatio?: number;
  /** 允许的宽高比范围（正方形 ≈ 1）。 */
  minAspect?: number;
  maxAspect?: number;
}

interface Component {
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
}

const DEFAULTS = {
  minSizeRatio: 0.003,
  maxSizeRatio: 0.04,
  minAspect: 0.55,
  maxAspect: 1.8,
} as const;

/**
 * 用连通域找定位块。
 *
 * 只扫 ink 像素（binary=1），4 邻接；组件数量在拍照场景里很小（纸面文字会被
 * 面积/形状过滤掉），所以不需要复杂的并查集。
 */
export function findFiducialQuad(
  binary: Uint8Array,
  width: number,
  height: number,
  options: FiducialOptions = {},
): Quad | null {
  if (width <= 0 || height <= 0) return null;
  if (binary.length !== width * height) return null;

  const minSize = Math.max(
    4,
    Math.round(Math.min(width, height) * (options.minSizeRatio ?? DEFAULTS.minSizeRatio)),
  );
  const maxSize = Math.round(
    Math.min(width, height) * (options.maxSizeRatio ?? DEFAULTS.maxSizeRatio),
  );
  const minAspect = options.minAspect ?? DEFAULTS.minAspect;
  const maxAspect = options.maxAspect ?? DEFAULTS.maxAspect;

  const visited = new Uint8Array(binary.length);
  const queue = new Int32Array(binary.length);
  const components: Component[] = [];

  for (let start = 0; start < binary.length; start += 1) {
    if (binary[start] !== 1 || visited[start] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    const startX = start % width;
    const startY = (start - startX) / width;
    const component: Component = {
      area: 0,
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY,
      sumX: 0,
      sumY: 0,
    };

    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      const x = index % width;
      const y = (index - x) / width;

      component.area += 1;
      component.sumX += x;
      component.sumY += y;
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;

      // 4 邻接
      if (x > 0) {
        const next = index - 1;
        if (binary[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (binary[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (y > 0) {
        const next = index - width;
        if (binary[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (binary[next] === 1 && visited[next] === 0) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }

    components.push(component);
  }

  const squares: Point[] = [];
  for (const component of components) {
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    if (boxWidth < minSize || boxHeight < minSize) continue;
    if (boxWidth > maxSize || boxHeight > maxSize) continue;
    const aspect = boxWidth / boxHeight;
    if (aspect < minAspect || aspect > maxAspect) continue;
    // 实心方块：填充率应接近 1；文字/边框的填充率低，会被挡掉。
    if (component.area / (boxWidth * boxHeight) < 0.6) continue;
    squares.push({
      x: component.sumX / component.area,
      y: component.sumY / component.area,
    });
  }

  if (squares.length < 4) return null;

  // 取四个"最靠角"的候选：x±y 的极值。定位块是纸面上离四角最近的东西。
  const pick = (score: (point: Point) => number): Point | null => {
    let best: Point | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const point of squares) {
      const value = score(point);
      if (value < bestScore) {
        bestScore = value;
        best = point;
      }
    }
    return best;
  };

  const topLeft = pick((point) => point.x + point.y);
  // TR：x 最大、y 最小 → 等价于最小化 (y - x)
  const topRight = pick((point) => point.y - point.x);
  const bottomRight = pick((point) => -point.x - point.y);
  const bottomLeft = pick((point) => point.x - point.y);

  if (topLeft === null || topRight === null || bottomRight === null || bottomLeft === null)
    return null;
  const quad: Quad = [topLeft, topRight, bottomRight, bottomLeft];

  // 四个点必须互不相同，且围出像样的面积（避免把同一簇/一条边当纸）。
  const unique = new Set(quad.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`));
  if (unique.size < 4) return null;

  if (quadArea(quad) < width * height * 0.02) return null;
  return quad;
}

function quadArea(quad: Quad): number {
  let area = 0;
  for (let index = 0; index < quad.length; index += 1) {
    const current = quad[index];
    const next = quad[(index + 1) % quad.length];
    if (current === undefined || next === undefined) return 0;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}
