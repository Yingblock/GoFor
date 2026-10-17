import { describe, expect, it } from 'vitest';
import { inkCount, inkRatio } from './index.ts';
import { createBinary, fillBinaryRect } from './test-helpers.ts';

const WIDTH = 10;
const HEIGHT = 10;

function leftHalfInk(): Uint8Array {
  const binary = createBinary(WIDTH, HEIGHT, 0);
  fillBinaryRect(binary, WIDTH, HEIGHT, 0, 0, 5, HEIGHT, 1);
  return binary;
}

describe('inkRatio', () => {
  it('全空（白纸）矩形返回 0', () => {
    const binary = createBinary(WIDTH, HEIGHT, 0);
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 1, h: 1 })).toBe(0);
  });

  it('全黑矩形返回 1', () => {
    const binary = createBinary(WIDTH, HEIGHT, 1);
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 1, h: 1 })).toBe(1);
  });

  it('半黑半白约等于 0.5', () => {
    const binary = leftHalfInk();
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 1, h: 1 })).toBeCloseTo(0.5, 6);
  });

  it('矩形越界时被钳制在页内', () => {
    const binary = leftHalfInk();
    // 从页面中线开始、一直延伸到页外：只剩右半页（无墨迹）。
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0.5, y: 0, w: 1, h: 1 })).toBe(0);
    // 右半页 + 页外，但右半页无墨迹。
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0.5, y: 0, w: 2, h: 2 })).toBe(0);
    // 负坐标同样被钳制：整个矩形扩展到页外，实际只统计页内的右半页。
    const rightHalf = createBinary(WIDTH, HEIGHT, 0);
    fillBinaryRect(rightHalf, WIDTH, HEIGHT, 5, 0, 5, HEIGHT, 1);
    expect(inkRatio(rightHalf, WIDTH, HEIGHT, { x: -1, y: -1, w: 2, h: 2 })).toBeCloseTo(0.5, 6);
  });

  it('宽或高为 0 返回 0', () => {
    const binary = createBinary(WIDTH, HEIGHT, 1);
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 0, h: 1 })).toBe(0);
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 1, h: 0 })).toBe(0);
  });

  it('完全落在页外的矩形返回 0', () => {
    const binary = createBinary(WIDTH, HEIGHT, 1);
    expect(inkRatio(binary, WIDTH, HEIGHT, { x: 2, y: 0, w: 0.5, h: 1 })).toBe(0);
  });
});

describe('inkCount', () => {
  it('返回绝对墨迹像素数', () => {
    const binary = leftHalfInk();
    expect(inkCount(binary, WIDTH, HEIGHT, { x: 0, y: 0, w: 1, h: 1 })).toBe(50);
  });

  it('子像素窗口只统计被覆盖到的像素', () => {
    const binary = createBinary(WIDTH, HEIGHT, 0);
    fillBinaryRect(binary, WIDTH, HEIGHT, 9, 0, 1, HEIGHT, 1); // 最右一列
    expect(inkCount(binary, WIDTH, HEIGHT, { x: 0.85, y: 0, w: 0.2, h: 0.1 })).toBe(1);
  });
});
