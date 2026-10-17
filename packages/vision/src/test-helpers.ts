import type { ImageDataLike } from './types.ts';

/** 仅测试用：自己填 RGBA，不依赖任何图片库。 */
export function createImage(
  width: number,
  height: number,
  r = 255,
  g = 255,
  b = 255,
  a = 255,
): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }
  return { width, height, data };
}

/** 仅测试用：填一个矩形（坐标自动钳制在图像内）。 */
export function fillImageRect(
  image: ImageDataLike,
  x0: number,
  y0: number,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const startX = Math.max(0, Math.trunc(x0));
  const startY = Math.max(0, Math.trunc(y0));
  const endX = Math.min(image.width, Math.trunc(x0 + width));
  const endY = Math.min(image.height, Math.trunc(y0 + height));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = a;
    }
  }
}

/** 仅测试用：全画面单一值的二值图。 */
export function createBinary(width: number, height: number, value: 0 | 1): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

/** 仅测试用：在二值图上填矩形（坐标自动钳制）。 */
export function fillBinaryRect(
  binary: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  x0: number,
  y0: number,
  width: number,
  height: number,
  value: 0 | 1,
): void {
  const startX = Math.max(0, Math.trunc(x0));
  const startY = Math.max(0, Math.trunc(y0));
  const endX = Math.min(imageWidth, Math.trunc(x0 + width));
  const endY = Math.min(imageHeight, Math.trunc(y0 + height));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      binary[y * imageWidth + x] = value;
    }
  }
}
