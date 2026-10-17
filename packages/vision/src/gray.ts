import type { ImageDataLike } from './types.ts';

/** ITU-R BT.601 亮度权重（人眼对绿最敏感）。 */
const RED_WEIGHT = 0.299;
const GREEN_WEIGHT = 0.587;
const BLUE_WEIGHT = 0.114;

/**
 * 取灰度（ITU-R BT.601 加权），返回 Float32Array(width*height)，0–255。
 *
 * 忽略 alpha；`data` 长度不足（例如被截断）时，缺失部分按黑（0）处理，
 * 输出长度始终等于 width*height。
 */
export function toGray(image: ImageDataLike): Float32Array {
  const width = Math.max(0, Math.trunc(image.width));
  const height = Math.max(0, Math.trunc(image.height));
  const pixelCount = width * height;
  const gray = new Float32Array(pixelCount);
  const available = Math.min(pixelCount, Math.floor(image.data.length / 4));

  for (let i = 0; i < available; i += 1) {
    const offset = i * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    gray[i] = RED_WEIGHT * r + GREEN_WEIGHT * g + BLUE_WEIGHT * b;
  }

  return gray;
}
