/**
 * 归一化矩形（0–1，相对矫正后的整页）的像素边界。
 * 返回**左闭右开**区间；矩形被钳制在页内，完全落在页外或面积为 0 时返回 null。
 */
interface PixelBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pixelBounds(
  imageWidth: number,
  imageHeight: number,
  rect: { x: number; y: number; w: number; h: number },
): PixelBounds | null {
  const width = Math.trunc(imageWidth);
  const height = Math.trunc(imageHeight);
  if (width <= 0 || height <= 0) return null;

  // 宽或高不是正数 = 没有面积；NaN 也走这里。
  if (!(rect.w > 0) || !(rect.h > 0)) return null;
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null;

  const x0 = clamp(Math.floor(rect.x * width), 0, width);
  const x1 = clamp(Math.ceil((rect.x + rect.w) * width), 0, width);
  const y0 = clamp(Math.floor(rect.y * height), 0, height);
  const y1 = clamp(Math.ceil((rect.y + rect.h) * height), 0, height);

  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, x1, y0, y1 };
}

/**
 * 归一化矩形内的墨迹像素数（绝对值，调试/自适应阈值用）。
 * `binary` 里非 0 一律视为墨迹；长度不足时缺失部分按纸（0）处理。
 */
export function inkCount(
  binary: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  rect: { x: number; y: number; w: number; h: number },
): number {
  const bounds = pixelBounds(imageWidth, imageHeight, rect);
  if (!bounds) return 0;

  const rowStride = Math.trunc(imageWidth);
  let count = 0;
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    const rowOffset = y * rowStride;
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      if ((binary[rowOffset + x] ?? 0) !== 0) count += 1;
    }
  }
  return count;
}

/**
 * 归一化矩形（0–1，相对矫正后的整页）里墨迹像素占比。
 * 矩形会被钳制在页内；面积不足 1 像素时返回 0。
 */
export function inkRatio(
  binary: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  rect: { x: number; y: number; w: number; h: number },
): number {
  const bounds = pixelBounds(imageWidth, imageHeight, rect);
  if (!bounds) return 0;

  const area = (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0);
  if (area < 1) return 0;

  return inkCount(binary, imageWidth, imageHeight, rect) / area;
}
