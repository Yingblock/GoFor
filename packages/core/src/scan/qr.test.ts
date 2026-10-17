import { describe, expect, it } from 'vitest';
import { buildFillLink } from './deeplink.ts';
import { decodeQr, decodeQrFromGray, encodeQrMatrix, encodeQrSvgPath } from './qr.ts';

/**
 * 把模块矩阵画成灰度图：白底 255、黑块 0，四周留 4 模块静区。
 *
 * 这就是"手机拍到的纸"的最小替身：只要这段渲染 → 解码能通，
 * 就说明生成端与解码端的格式假设（模块方向、黑白、静区）完全一致。
 */
function renderToGray(
  text: string,
  scale = 8,
  quietModules = 4,
): { gray: Uint8ClampedArray; width: number; height: number } {
  const { size, modules } = encodeQrMatrix(text);
  const width = (size + quietModules * 2) * scale;
  const gray = new Uint8ClampedArray(width * width).fill(255);
  for (let row = 0; row < size; row += 1) {
    const line = modules[row];
    if (line === undefined) continue;
    for (let col = 0; col < size; col += 1) {
      if (!line[col]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        const start = ((row + quietModules) * scale + dy) * width + (col + quietModules) * scale;
        gray.fill(0, start, start + scale);
      }
    }
  }
  return { gray, width, height: width };
}

function renderToRgba(text: string, scale = 8, quietModules = 4): Uint8ClampedArray {
  const { gray, width } = renderToGray(text, scale, quietModules);
  const rgba = new Uint8ClampedArray(width * width * 4);
  for (let index = 0; index < gray.length; index += 1) {
    const value = gray[index] ?? 0;
    const base = index * 4;
    rgba[base] = value;
    rgba[base + 1] = value;
    rgba[base + 2] = value;
    rgba[base + 3] = 255;
  }
  return rgba;
}

const TEXT = buildFillLink({
  templateId: 'day',
  date: '2026-03-05',
  paper: 'A4',
  version: 1,
});

describe('二维码：生成', () => {
  it('模块矩阵是 size × size 的方阵，且定位符在三个角上', () => {
    const { size, modules } = encodeQrMatrix(TEXT);
    expect(size).toBeGreaterThanOrEqual(21);
    expect(modules).toHaveLength(size);
    for (const line of modules) expect(line).toHaveLength(size);

    // 左上、右上、左下是定位符：最外圈黑、内部一圈白、中心 3×3 黑。
    expect(modules[0]?.[0]).toBe(true);
    expect(modules[0]?.[size - 1]).toBe(true);
    expect(modules[size - 1]?.[0]).toBe(true);
    expect(modules[1]?.[1]).toBe(false);
    expect(modules[3]?.[3]).toBe(true);
  });

  it('SVG path 是单条 path，坐标不超出模块范围', () => {
    const { size, path } = encodeQrSvgPath(TEXT);
    const { size: matrixSize } = encodeQrMatrix(TEXT);
    expect(size).toBe(matrixSize);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('z')).toBe(true);
    // 只允许模块单位的小数字、命令字母与负的相对宽度。
    expect(path).toMatch(/^[Mhvz0-9\s-]+$/);
    expect(path).toContain('v1');
  });

  it('空串抛错（而不是生成一张扫不出来的白纸）', () => {
    expect(() => encodeQrMatrix('')).toThrow('二维码内容不能为空');
  });

  it('超过容量抛错', () => {
    // M 级 version 40 的字节容量约 2331；3000 个 ASCII 必然溢出。
    expect(() => encodeQrMatrix('x'.repeat(3000))).toThrow();
  });
});

describe('二维码：encode → 渲染 → decode 端到端', () => {
  it('灰度图能解出原文（证明整条链路在 Node 里可验证）', () => {
    const { gray, width, height } = renderToGray(TEXT);
    expect(decodeQrFromGray(gray, width, height)).toBe(TEXT);
  });

  it('RGBA 输入也能解出原文', () => {
    const { width } = renderToGray(TEXT);
    expect(decodeQr(new Uint8ClampedArray(renderToRgba(TEXT)), width, width)).toBe(TEXT);
  });

  it('乱码图 / 纯色图解码返回 null', () => {
    expect(decodeQrFromGray(new Uint8ClampedArray(64 * 64).fill(255), 64, 64)).toBeNull();
    expect(decodeQrFromGray(new Uint8ClampedArray(64 * 64), 64, 64)).toBeNull();
  });

  it('宽高与缓冲区长度不一致时返回 null', () => {
    expect(decodeQrFromGray(new Uint8ClampedArray(10), 4, 4)).toBeNull();
    expect(decodeQrFromGray(new Uint8ClampedArray(16), 4, 4)).toBeNull();
    expect(decodeQrFromGray(new Uint8ClampedArray(16), 0, 4)).toBeNull();
    expect(decodeQr(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});
