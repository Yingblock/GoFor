import { otsuThreshold } from './otsu.ts';

/**
 * 二值化：返回 Uint8Array，1 = 墨迹（暗），0 = 纸。threshold 缺省用 Otsu。
 *
 * 判定规则是 `gray < threshold`：正好等于阈值的像素算纸，
 * 这样全白图（阈值 = 255）不会把自己判成墨迹。
 */
export function binarize(gray: Float32Array, threshold?: number): Uint8Array {
  const cutoff = threshold ?? otsuThreshold(gray);
  const binary = new Uint8Array(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    binary[i] = (gray[i] ?? 0) < cutoff ? 1 : 0;
  }

  return binary;
}
