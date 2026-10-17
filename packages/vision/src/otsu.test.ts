import { describe, expect, it } from 'vitest';
import { otsuThreshold, toGray } from './index.ts';
import { createImage, fillImageRect } from './test-helpers.ts';

describe('otsuThreshold', () => {
  it('白纸中间一个黑块：阈值落在黑与白之间', () => {
    const image = createImage(20, 20);
    fillImageRect(image, 7, 7, 6, 6, 0, 0, 0);
    const gray = toGray(image);

    const threshold = otsuThreshold(gray);

    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(255);
    // 双峰的理想分割点应该在两峰均值附近（±10 容差足够）。
    expect(threshold).toBeGreaterThan(118);
    expect(threshold).toBeLessThan(138);
  });

  it('全白图不崩，返回 255', () => {
    const gray = toGray(createImage(10, 10));
    expect(otsuThreshold(gray)).toBe(255);
  });

  it('全黑图返回 0', () => {
    const gray = toGray(createImage(10, 10, 0, 0, 0));
    expect(otsuThreshold(gray)).toBe(0);
  });

  it('空灰度图返回 0', () => {
    expect(otsuThreshold(new Float32Array(0))).toBe(0);
  });

  it('连续渐变图的阈值落在灰度范围内', () => {
    const gray = new Float32Array(1024);
    for (let i = 0; i < gray.length; i += 1) {
      gray[i] = i % 256;
    }
    const threshold = otsuThreshold(gray);
    expect(Number.isFinite(threshold)).toBe(true);
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(255);
  });
});
