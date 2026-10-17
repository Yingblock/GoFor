import { describe, expect, it } from 'vitest';
import { type ImageDataLike, identityQuad, type Quad, toGray, warpQuad } from './index.ts';
import { createImage, fillImageRect } from './test-helpers.ts';

/** 每像素都不同的确定性图案，用来验证「逐像素」级别的正确性。 */
function patternImage(width: number, height: number): ImageDataLike {
  const image = createImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      image.data[offset] = (x * 37 + y * 11) % 256;
      image.data[offset + 1] = (x * 17 + y * 53) % 256;
      image.data[offset + 2] = (x * 91 + y * 7) % 256;
      image.data[offset + 3] = 255;
    }
  }
  return image;
}

function pixelGray(gray: Float32Array, width: number, x: number, y: number): number {
  return gray[y * width + x] ?? 0;
}

describe('identityQuad', () => {
  it('返回整页四角（像素中心坐标）', () => {
    expect(identityQuad(8, 6)).toEqual([
      { x: 0, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it('1×1 退化为四个相同点', () => {
    expect(identityQuad(1, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('warpQuad', () => {
  it('恒等映射 == 原图（逐像素）', () => {
    const source = patternImage(8, 6);
    const out = warpQuad(source, identityQuad(8, 6), 8, 6);

    expect(out.width).toBe(8);
    expect(out.height).toBe(6);
    expect(Array.from(out.data)).toEqual(Array.from(source.data));
  });

  it('单像素宽度的恒等映射也精确', () => {
    const source = patternImage(1, 3);
    const out = warpQuad(source, identityQuad(1, 3), 1, 3);
    expect(Array.from(out.data)).toEqual(Array.from(source.data));
  });

  it('旋转 90°：四边形四角正确落到输出四角', () => {
    // 源图 4×3，每个像素的灰度唯一：value = 10 + x*20 + y*5。
    const source = createImage(4, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4;
        const value = 10 + x * 20 + y * 5;
        source.data[offset] = value;
        source.data[offset + 1] = value;
        source.data[offset + 2] = value;
      }
    }
    // 顺时针转 90°：输出 3×4，out(x,y) = src(x'=y, y'=2-x)。
    const rotated: Quad = [
      { x: 0, y: 2 },
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
    ];

    const out = warpQuad(source, rotated, 3, 4);
    const gray = toGray(out);

    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const expected = 10 + y * 20 + (2 - x) * 5;
        expect(pixelGray(gray, 3, x, y)).toBeCloseTo(expected, 0);
      }
    }
  });

  it('非平行四边形的梯形四边形按投影变换校正', () => {
    const source = createImage(60, 60);
    // 四边形：左下角向内收，产生真正的透视（非仿射）变形。
    const page: Quad = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 50 },
      { x: 10, y: 40 },
    ];
    for (const corner of page) {
      fillImageRect(source, corner.x - 1, corner.y - 1, 3, 3, 0, 0, 0);
    }
    // 单独标记左上角为蓝色，验证输出左上角取的正是该角。
    fillImageRect(source, 9, 9, 3, 3, 0, 0, 255);

    const out = warpQuad(source, page, 8, 8);
    const gray = toGray(out);
    const topLeft = 0;
    expect(Array.from(out.data.slice(topLeft, topLeft + 3))).toEqual([0, 0, 255]);
    expect(pixelGray(gray, 8, 0, 0)).toBeLessThan(60);
    expect(pixelGray(gray, 8, 7, 0)).toBeLessThan(60);
    expect(pixelGray(gray, 8, 7, 7)).toBeLessThan(60);
    expect(pixelGray(gray, 8, 0, 7)).toBeLessThan(60);
  });

  it('白底黑框 + 四角黑块：矫正后四角仍是黑的', () => {
    const source = createImage(80, 60);
    // 纸区域 (10,10)-(69,49)，四边黑框。
    fillImageRect(source, 10, 10, 60, 4, 0, 0, 0);
    fillImageRect(source, 10, 46, 60, 4, 0, 0, 0);
    fillImageRect(source, 10, 10, 4, 40, 0, 0, 0);
    fillImageRect(source, 66, 10, 4, 40, 0, 0, 0);
    // 四角黑块。
    fillImageRect(source, 10, 10, 8, 8, 0, 0, 0);
    fillImageRect(source, 62, 10, 8, 8, 0, 0, 0);
    fillImageRect(source, 62, 42, 8, 8, 0, 0, 0);
    fillImageRect(source, 10, 42, 8, 8, 0, 0, 0);

    const page: Quad = [
      { x: 10, y: 10 },
      { x: 69, y: 10 },
      { x: 69, y: 49 },
      { x: 10, y: 49 },
    ];
    const out = warpQuad(source, page, 60, 40);
    const gray = toGray(out);

    for (const [x, y] of [
      [0, 0],
      [59, 0],
      [59, 39],
      [0, 39],
    ] as const) {
      expect(pixelGray(gray, 60, x, y)).toBeLessThan(60);
    }
    expect(pixelGray(gray, 60, 30, 20)).toBeGreaterThan(200);
  });

  it('四边形超出源图时按边缘钳制，不产生越界/NaN', () => {
    const source = createImage(20, 20);
    fillImageRect(source, 0, 0, 1, 1, 0, 0, 255); // 左上角蓝
    fillImageRect(source, 19, 19, 1, 1, 255, 0, 0); // 右下角红

    const overshoot: Quad = [
      { x: -5, y: -5 },
      { x: 30, y: -5 },
      { x: 30, y: 30 },
      { x: -5, y: 30 },
    ];
    const out = warpQuad(source, overshoot, 4, 4);
    expect(out.data.length).toBe(4 * 4 * 4);

    const topLeft = 0;
    const bottomRight = (3 * 4 + 3) * 4;
    expect(Array.from(out.data.slice(topLeft, topLeft + 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(out.data.slice(bottomRight, bottomRight + 4))).toEqual([255, 0, 0, 255]);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });

  it('退化四边形（四点重合）不崩，取该点颜色', () => {
    const source = createImage(10, 10);
    fillImageRect(source, 5, 5, 1, 1, 0, 0, 0);
    const degenerate: Quad = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const out = warpQuad(source, degenerate, 4, 4);
    expect(out.data.length).toBe(64);
    expect(pixelGray(toGray(out), 4, 2, 2)).toBeLessThan(10);
  });

  it('输出尺寸为 0 时返回空数据', () => {
    const source = createImage(8, 6);
    const out = warpQuad(source, identityQuad(8, 6), 0, 0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    expect(out.data.length).toBe(0);
  });
});
