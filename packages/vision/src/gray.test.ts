import { describe, expect, it } from 'vitest';
import { toGray } from './index.ts';
import { createImage } from './test-helpers.ts';

function grayOf(r: number, g: number, b: number): number {
  return toGray(createImage(1, 1, r, g, b, 255))[0] ?? 0;
}

describe('toGray', () => {
  it('纯红按 BT.601 取 0.299 权重', () => {
    expect(grayOf(255, 0, 0)).toBeCloseTo(76.245, 3);
  });

  it('纯绿按 BT.601 取 0.587 权重', () => {
    expect(grayOf(0, 255, 0)).toBeCloseTo(149.685, 3);
  });

  it('纯蓝按 BT.601 取 0.114 权重', () => {
    expect(grayOf(0, 0, 255)).toBeCloseTo(29.07, 3);
  });

  it('白色是 255，黑色是 0', () => {
    expect(grayOf(255, 255, 255)).toBeCloseTo(255, 3);
    expect(grayOf(0, 0, 0)).toBeCloseTo(0, 3);
  });

  it('输出长度等于 width*height，alpha 不参与计算', () => {
    const image = createImage(3, 2, 255, 0, 0, 0);
    const gray = toGray(image);
    expect(gray.length).toBe(6);
    expect(gray[5]).toBeCloseTo(76.245, 3);
  });

  it('data 被截断时按黑补齐，不抛错', () => {
    const image = { width: 2, height: 2, data: new Uint8ClampedArray(4) };
    const gray = toGray(image);
    expect(gray.length).toBe(4);
    expect(Array.from(gray)).toEqual([0, 0, 0, 0]);
  });
});
