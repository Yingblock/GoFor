import { describe, expect, it } from 'vitest';
import { findFiducialQuad } from './fiducial.ts';

/** 在二值图上画一个实心方块。 */
function fillSquare(binary: Uint8Array, width: number, x: number, y: number, size: number): void {
  for (let dy = 0; dy < size; dy += 1) {
    const row = (y + dy) * width;
    binary.fill(1, row + x, row + x + size);
  }
}

function pageWithFiducials(width = 800, height = 1100, size = 14): Uint8Array {
  const binary = new Uint8Array(width * height);
  const offset = 20;
  fillSquare(binary, width, offset, offset, size);
  fillSquare(binary, width, width - offset - size, offset, size);
  fillSquare(binary, width, width - offset - size, height - offset - size, size);
  fillSquare(binary, width, offset, height - offset - size, size);
  return binary;
}

describe('定位块：找四角', () => {
  it('四个实心方块 → 返回 TL/TR/BR/BL 中心', () => {
    const width = 800;
    const height = 1100;
    const binary = pageWithFiducials(width, height);
    const quad = findFiducialQuad(binary, width, height);
    expect(quad).not.toBeNull();
    if (quad === null) return;
    expect(quad[0].x).toBeLessThan(60);
    expect(quad[0].y).toBeLessThan(60);
    expect(quad[1].x).toBeGreaterThan(width - 60);
    expect(quad[2].y).toBeGreaterThan(height - 60);
    expect(quad[3].x).toBeLessThan(60);
  });

  it('没有定位块 / 只有细线 → null', () => {
    const width = 300;
    const height = 400;
    const empty = new Uint8Array(width * height);
    expect(findFiducialQuad(empty, width, height)).toBeNull();

    const lines = new Uint8Array(width * height);
    // 细横线：填充率低、形状不合格
    for (let y = 20; y < height; y += 20) lines.fill(1, y * width, y * width + width);
    expect(findFiducialQuad(lines, width, height)).toBeNull();
  });

  it('候选不足四个 → null（只有三个角）', () => {
    const width = 800;
    const height = 1100;
    const binary = new Uint8Array(width * height);
    fillSquare(binary, width, 20, 20, 14);
    fillSquare(binary, width, width - 34, 20, 14);
    fillSquare(binary, width, 20, height - 34, 14);
    expect(findFiducialQuad(binary, width, height)).toBeNull();
  });
});
