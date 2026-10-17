/**
 * 二维码的生成与解码。
 *
 * 只用纯 JS：`qrcode` 算模块矩阵（不经过 canvas），`jsqr` 从像素解码。
 * 这样整条链路能在 Node/Vitest 里端到端验证——不需要摄像头，也不需要浏览器。
 *
 * 分工边界：
 * - 本模块只处理"文字 ↔ 模块矩阵 / 像素"；
 * - 图像预处理（灰度、二值化、透视矫正）属于 `@gofor/vision`，不在 core。
 */

import jsQR from 'jsqr';
import QRCode from 'qrcode';

export interface QrMatrix {
  /** 每边的模块数（不含静区）。 */
  size: number;
  /** `modules[row][col]`，true = 黑块。 */
  modules: boolean[][];
}

/**
 * 生成二维码模块矩阵。
 *
 * 纠错等级固定 `M`（约 15%）：纸上可能被笔迹、折痕、灰尘局部遮挡，
 * 比 L 稳；再高会挤占容量，而我们的载荷只有几十字节。
 *
 * 空串与超容量都**抛错**（而不是静默返回空矩阵/半截内容）：
 * 打印一张扫不出来的纸是无法在事后补救的失败，必须在生成阶段就红。
 */
export function encodeQrMatrix(text: string): QrMatrix {
  if (text === '') throw new Error('二维码内容不能为空');
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      line.push(qr.modules.get(row, col) === 1);
    }
    modules.push(line);
  }
  return { size, modules };
}

/**
 * 渲染成 SVG `path` 的 `d` 属性，坐标单位是**模块**（1 单位 = 1 模块）。
 *
 * 不含静区、不含缩放：调用方按自己的物理边长算 `scale`，再整体平移
 * `4 × scale`（标准要求至少 4 模块静区）。返回单条 path，打印层直接：
 *
 * ```html
 * <svg viewBox="0 0 ${size} ${size}"><path d="${path}" /></svg>
 * ```
 *
 * 生成方式是按行合并连续黑块，比每块一个 `<rect>` 少几十个节点。
 */
export function encodeQrSvgPath(text: string): { size: number; path: string } {
  const { size, modules } = encodeQrMatrix(text);
  const segments: string[] = [];
  for (let row = 0; row < size; row += 1) {
    const line = modules[row];
    if (line === undefined) continue;
    let col = 0;
    while (col < size) {
      if (!line[col]) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < size && line[end]) end += 1;
      const width = end - col;
      segments.push(`M${col} ${row}h${width}v1h${-width}z`);
      col = end;
    }
  }
  return { size, path: segments.join('') };
}

/**
 * 从 **RGBA** 像素解码。失败（图里没有二维码 / 尺寸不合法）返回 null。
 *
 * 与 `decodeQrFromGray` 的区别只是输入格式：jsQR 的原生输入是 RGBA，
 * 如果调用方本来就拿着 RGBA（例如相机帧），用这个可以省一次逐像素展开。
 */
export function decodeQr(image: Uint8ClampedArray, width: number, height: number): string | null {
  if (!isValidImageSize(image, width, height, 4)) return null;
  const decoded = jsQR(image, width, height, { inversionAttempts: 'attemptBoth' });
  return decoded?.data ?? null;
}

/**
 * 从灰度图解码。失败返回 null。
 *
 * 灰度是扫描链路（`toGray` → 光照均衡）的中间产物，所以这是主入口。
 * 内部把 `gray` 展开成 jsQR 要的 RGBA（`r=g=b=gray, a=255`）——
 * 注意 jsQR **不吃**单通道数据，直接喂灰度会得到 null。
 *
 * 尺寸与缓冲区长度必须自洽；不自洽说明上游把宽高搞错了，返回 null 比越界读安全。
 */
export function decodeQrFromGray(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  if (!isValidImageSize(gray, width, height, 1)) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < gray.length; index += 1) {
    const value = gray[index] ?? 0;
    const base = index * 4;
    rgba[base] = value;
    rgba[base + 1] = value;
    rgba[base + 2] = value;
    rgba[base + 3] = 255;
  }
  return decodeQr(rgba, width, height);
}

function isValidImageSize(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return false;
  }
  return image.length === width * height * channels;
}
