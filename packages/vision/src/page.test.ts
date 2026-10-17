import { describe, expect, it } from 'vitest';
import { detectPageQuad, type Quad } from './index.ts';
import { createBinary, fillBinaryRect } from './test-helpers.ts';

function requireQuad(quad: Quad | null): Quad {
  if (!quad) throw new Error('expected detectPageQuad to return a quad');
  return quad;
}

function expectQuadClose(actual: Quad, expected: Quad, tolerance: number): void {
  const [a0, a1, a2, a3] = actual;
  const [e0, e1, e2, e3] = expected;
  const pairs = [
    [a0, e0],
    [a1, e1],
    [a2, e2],
    [a3, e3],
  ] as const;
  for (const [point, target] of pairs) {
    expect(Math.abs(point.x - target.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(point.y - target.y)).toBeLessThanOrEqual(tolerance);
  }
}

describe('detectPageQuad', () => {
  it('深色背景 + 中间白色矩形：返回近似四角', () => {
    const width = 100;
    const height = 80;
    const binary = createBinary(width, height, 1);
    fillBinaryRect(binary, width, height, 20, 10, 60, 60, 0);

    const quad = requireQuad(detectPageQuad(binary, width, height));

    expectQuadClose(
      quad,
      [
        { x: 20, y: 10 },
        { x: 79, y: 10 },
        { x: 79, y: 69 },
        { x: 20, y: 69 },
      ],
      1.5,
    );
  });

  it('纸不在中心（偏右下角）也能找到', () => {
    const width = 120;
    const height = 90;
    const binary = createBinary(width, height, 1);
    fillBinaryRect(binary, width, height, 60, 50, 50, 40, 0);

    const quad = requireQuad(detectPageQuad(binary, width, height));

    expectQuadClose(
      quad,
      [
        { x: 60, y: 50 },
        { x: 109, y: 50 },
        { x: 109, y: 89 },
        { x: 60, y: 89 },
      ],
      1.5,
    );
  });

  it('全白图返回接近整图的四角（不崩）', () => {
    const width = 100;
    const height = 80;
    const binary = createBinary(width, height, 0);

    const quad = requireQuad(detectPageQuad(binary, width, height));

    expectQuadClose(
      quad,
      [
        { x: 0, y: 0 },
        { x: 99, y: 0 },
        { x: 99, y: 79 },
        { x: 0, y: 79 },
      ],
      0.5,
    );
  });

  it('全黑图找不到纸，返回 null', () => {
    const binary = createBinary(60, 40, 1);
    expect(detectPageQuad(binary, 60, 40)).toBeNull();
  });

  it('只有孤立噪点时返回 null', () => {
    const width = 100;
    const height = 80;
    const binary = createBinary(width, height, 1);
    fillBinaryRect(binary, width, height, 40, 40, 3, 3, 0);

    expect(detectPageQuad(binary, width, height)).toBeNull();
  });

  it('大图 4000×3000 能在有界迭代内跑完并给出合理四角', () => {
    const width = 4000;
    const height = 3000;
    const binary = createBinary(width, height, 1);
    fillBinaryRect(binary, width, height, 1000, 750, 2000, 1500, 0);

    const quad = requireQuad(detectPageQuad(binary, width, height));

    // 降采样步长为 8，容差取 2 个格子。
    expectQuadClose(
      quad,
      [
        { x: 1000, y: 750 },
        { x: 2999, y: 750 },
        { x: 2999, y: 2249 },
        { x: 1000, y: 2249 },
      ],
      16,
    );
  });
});
