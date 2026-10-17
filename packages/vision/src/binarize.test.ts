import { describe, expect, it } from 'vitest';
import { binarize, toGray } from './index.ts';
import { createImage, fillImageRect } from './test-helpers.ts';

describe('binarize', () => {
  it('显式阈值：小于阈值算墨迹，等于阈值算纸', () => {
    const gray = Float32Array.from([0, 100, 127, 128, 200, 255]);
    const binary = binarize(gray, 128);
    expect(Array.from(binary)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('自动阈值：黑块为墨迹，白纸不是墨迹', () => {
    const image = createImage(20, 20);
    fillImageRect(image, 5, 5, 8, 8, 0, 0, 0);
    const binary = binarize(toGray(image));

    expect(binary.length).toBe(400);
    // 64 个黑像素 = 墨迹，其余 336 个白像素 = 纸。
    let ink = 0;
    for (let i = 0; i < binary.length; i += 1) {
      if (binary[i] === 1) ink += 1;
    }
    expect(ink).toBe(64);
    expect(binary[5 * 20 + 5]).toBe(1);
    expect(binary[0]).toBe(0);
  });

  it('全白图自动阈值不会把纸判成墨迹', () => {
    const binary = binarize(toGray(createImage(8, 8)));
    expect(binary.length).toBe(64);
    expect(binary.some((value) => value !== 0)).toBe(false);
  });
});
