import { describe, expect, it } from 'vitest';
import { findMarkNear } from './mark.ts';

/** 在一张空白二值图上画一个十字（水平 + 垂直两条）。 */
function withCross(
  width: number,
  height: number,
  center: { x: number; y: number },
  size: number,
  stroke: number,
): Uint8Array {
  const binary = new Uint8Array(width * height);
  const half = Math.floor(size / 2);
  const line = (x0: number, y0: number, dx: number, dy: number, length: number) => {
    for (let step = 0; step < length; step += 1) {
      for (let t = 0; t < stroke; t += 1) {
        const x = x0 + dx * step + (dy === 0 ? 0 : t);
        const y = y0 + dy * step + (dx === 0 ? 0 : t);
        if (x >= 0 && x < width && y >= 0 && y < height) binary[y * width + x] = 1;
      }
    }
  };
  line(center.x - half, center.y, 1, 0, size);
  line(center.x, center.y - half, 0, 1, size);
  return binary;
}

describe('区块小定位点：附近找十字', () => {
  it('在预期位置找到十字质心', () => {
    const binary = withCross(60, 60, { x: 30, y: 30 }, 7, 2);
    const found = findMarkNear(
      binary,
      60,
      60,
      { x: 31, y: 29 },
      { radiusPx: 6, minBoxPx: 4, maxBoxPx: 10 },
    );
    expect(found).not.toBeNull();
    expect(found?.x).toBeCloseTo(30, 0);
    expect(found?.y).toBeCloseTo(30, 0);
  });

  it('太远的点不在搜索窗里，返回 null', () => {
    const binary = withCross(60, 60, { x: 50, y: 50 }, 7, 2);
    const found = findMarkNear(binary, 60, 60, { x: 20, y: 20 }, { radiusPx: 5 });
    expect(found).toBeNull();
  });

  it('尺寸过滤挡掉正文文字（大墨块），不会误当定位点', () => {
    const width = 80;
    const height = 80;
    const binary = new Uint8Array(width * height);
    // 预期位置附近没有十字，只有一个 14px 的实心文字块。
    for (let y = 30; y < 44; y += 1) {
      for (let x = 30; x < 44; x += 1) binary[y * width + x] = 1;
    }
    const found = findMarkNear(
      binary,
      width,
      height,
      { x: 37, y: 37 },
      { radiusPx: 12, minBoxPx: 3, maxBoxPx: 10 },
    );
    expect(found).toBeNull();
  });

  it('填充率过滤挡掉实心方块（页面四角定位块），只认十字', () => {
    const width = 80;
    const height = 80;
    const binary = new Uint8Array(width * height);
    // 实心 8px 方块：填充率 ≈1，超过 maxFill。
    for (let y = 30; y < 38; y += 1) {
      for (let x = 30; x < 38; x += 1) binary[y * width + x] = 1;
    }
    const found = findMarkNear(
      binary,
      width,
      height,
      { x: 34, y: 34 },
      { radiusPx: 8, minBoxPx: 4, maxBoxPx: 10, maxFill: 0.7 },
    );
    expect(found).toBeNull();
  });

  it('空图/尺寸不合法时返回 null', () => {
    expect(findMarkNear(new Uint8Array(100), 10, 10, { x: 5, y: 5 }, { radiusPx: 3 })).toBeNull();
    expect(findMarkNear(new Uint8Array(0), 0, 0, { x: 0, y: 0 }, { radiusPx: 3 })).toBeNull();
  });
});
