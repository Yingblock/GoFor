import type { ImageDataLike, Point, Quad } from './types.ts';

/**
 * 单位正方形 (u,v) ∈ [0,1]² 到源四边形的投影变换（Heckbert 的 square→quad 公式）。
 * `w` 是齐次因子，落在分母上。
 */
interface Homography {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * 整页四边形（像素坐标，角点落在像素中心）。
 *
 * 与 `warpQuad(image, identityQuad(w, h), w, h)` 配合时是**逐像素恒等**，
 * 也就是「不做矫正」的退化路径。宽/高为 0 时退化为全 0 点。
 */
export function identityQuad(width: number, height: number): Quad {
  const maxX = Math.max(0, Math.trunc(width) - 1);
  const maxY = Math.max(0, Math.trunc(height) - 1);
  return [
    { x: 0, y: 0 },
    { x: maxX, y: 0 },
    { x: maxX, y: maxY },
    { x: 0, y: maxY },
  ];
}

function squareToQuad(quad: Quad): Homography | null {
  const [tl, tr, br, bl] = quad;

  const dx1 = tr.x - br.x;
  const dx2 = bl.x - br.x;
  const dx3 = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y;
  const dy2 = bl.y - br.y;
  const dy3 = tl.y - tr.y + br.y - bl.y;

  // 平行四边形：没有投影项。
  if (dx3 === 0 && dy3 === 0) {
    return {
      a: tr.x - tl.x,
      b: bl.x - tl.x,
      c: tl.x,
      d: tr.y - tl.y,
      e: bl.y - tl.y,
      f: tl.y,
      g: 0,
      h: 0,
    };
  }

  const det = dx1 * dy2 - dx2 * dy1;
  if (det === 0 || !Number.isFinite(det)) return null;

  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  if (!Number.isFinite(g) || !Number.isFinite(h)) return null;

  return {
    a: tr.x - tl.x + g * tr.x,
    b: bl.x - tl.x + h * bl.x,
    c: tl.x,
    d: tr.y - tl.y + g * tr.y,
    e: bl.y - tl.y + h * bl.y,
    f: tl.y,
    g,
    h,
  };
}

/** 退化四边形（三点共线、角点重合）时退回双线性混合，保证不崩且不产生 NaN。 */
function bilinearQuad(quad: Quad, u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const bottomX = bl.x + (br.x - bl.x) * u;
  const bottomY = bl.y + (br.y - bl.y) * u;
  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

function mapSquare(homography: Homography, u: number, v: number): Point {
  const denominator = homography.g * u + homography.h * v + 1;
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return { x: Number.NaN, y: Number.NaN };
  }
  return {
    x: (homography.a * u + homography.b * v + homography.c) / denominator,
    y: (homography.d * u + homography.e * v + homography.f) / denominator,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 双线性采样一个像素，越界坐标先按边缘钳制。 */
function sampleBilinear(
  image: ImageDataLike,
  sourceX: number,
  sourceY: number,
  out: Uint8ClampedArray,
  outOffset: number,
): void {
  const width = image.width;
  const height = image.height;
  const x = clamp(sourceX, 0, width - 1);
  const y = clamp(sourceY, 0, height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const row0 = y0 * width;
  const row1 = y1 * width;
  const index00 = (row0 + x0) * 4;
  const index10 = (row0 + x1) * 4;
  const index01 = (row1 + x0) * 4;
  const index11 = (row1 + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const p00 = image.data[index00 + channel] ?? 0;
    const p10 = image.data[index10 + channel] ?? 0;
    const p01 = image.data[index01 + channel] ?? 0;
    const p11 = image.data[index11 + channel] ?? 0;
    const top = p00 + (p10 - p00) * fx;
    const bottom = p01 + (p11 - p01) * fx;
    out[outOffset + channel] = top + (bottom - top) * fy;
  }
}

/**
 * 透视矫正：把源图里的四边形映射成一个矩形（双线性采样）。
 * 输出尺寸由 outWidth/outHeight 指定；越界采样按边缘钳制。
 *
 * 几何用的是**投影变换**（真正的透视矫正，而不是仿射），
 * 像素取值用双线性插值。四边形的 4 个角分别对应输出的 4 个角：
 * 左上 → (0,0)，右上 → (outWidth-1,0)，右下 → (outWidth-1,outHeight-1)，
 * 左下 → (0,outHeight-1)（像素中心坐标）。退化四边形退回双线性混合。
 */
export function warpQuad(
  image: ImageDataLike,
  quad: Quad,
  outWidth: number,
  outHeight: number,
): ImageDataLike {
  const width = Math.max(0, Math.trunc(outWidth));
  const height = Math.max(0, Math.trunc(outHeight));
  const out = new Uint8ClampedArray(width * height * 4);

  const sourceWidth = Math.max(0, Math.trunc(image.width));
  const sourceHeight = Math.max(0, Math.trunc(image.height));
  if (width === 0 || height === 0 || sourceWidth === 0 || sourceHeight === 0) {
    return { width, height, data: out };
  }

  const homography = squareToQuad(quad);

  for (let y = 0; y < height; y += 1) {
    const v = height > 1 ? y / (height - 1) : 0.5;
    for (let x = 0; x < width; x += 1) {
      const u = width > 1 ? x / (width - 1) : 0.5;
      let mapped = homography ? mapSquare(homography, u, v) : bilinearQuad(quad, u, v);
      if (!Number.isFinite(mapped.x) || !Number.isFinite(mapped.y)) {
        mapped = bilinearQuad(quad, u, v);
      }
      sampleBilinear(image, mapped.x, mapped.y, out, (y * width + x) * 4);
    }
  }

  return { width, height, data: out };
}
