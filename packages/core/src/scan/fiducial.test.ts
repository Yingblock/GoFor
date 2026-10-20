import { describe, expect, it } from 'vitest';
import {
  FIDUCIAL_SIZE_MM,
  fiducialBottomInsetMm,
  fiducialFooterInsetMm,
  PAPER_SIZES,
} from '../print/index.ts';
import { expandFiducialQuad, type FiducialQuad } from './fiducial.ts';

/** 以 pxPerMm 生成 A4 正对镜头时的四个定位块中心（TL/TR/BR/BL）。 */
function axisAlignedA4(pxPerMm: number): FiducialQuad {
  const paper = PAPER_SIZES.A4;
  const top = 5.5;
  const side = 5.5;
  const bottom = fiducialBottomInsetMm(paper.heightMm);
  return [
    { x: side * pxPerMm, y: top * pxPerMm },
    { x: (paper.widthMm - side) * pxPerMm, y: top * pxPerMm },
    { x: (paper.widthMm - side) * pxPerMm, y: (paper.heightMm - bottom) * pxPerMm },
    { x: side * pxPerMm, y: (paper.heightMm - bottom) * pxPerMm },
  ];
}

describe('定位块外扩：非对称页脚', () => {
  it('A4 正对镜头：外扩后正好是纸角（上下内缩不同）', () => {
    const pxPerMm = 4;
    const quad = expandFiducialQuad(axisAlignedA4(pxPerMm), 'A4');
    const width = PAPER_SIZES.A4.widthMm * pxPerMm;
    const height = PAPER_SIZES.A4.heightMm * pxPerMm;
    expect(quad[0].x).toBeCloseTo(0, 6);
    expect(quad[0].y).toBeCloseTo(0, 6);
    expect(quad[1].x).toBeCloseTo(width, 6);
    expect(quad[1].y).toBeCloseTo(0, 6);
    expect(quad[2].x).toBeCloseTo(width, 6);
    expect(quad[2].y).toBeCloseTo(height, 6);
    expect(quad[3].x).toBeCloseTo(0, 6);
    expect(quad[3].y).toBeCloseTo(height, 6);
  });

  it('下方定位块比上方更靠里：纸角高度仍对得上（不是按 H/(H-11) 对称缩放）', () => {
    const quad = axisAlignedA4(3);
    const expanded = expandFiducialQuad(quad, 'A4');
    // 对称旧算法会把底边算在 297/(297-11) 比例的 297 - 5.5*... 处，底角会偏上；
    // 这里直接要求底角就是纸底边。
    expect(expanded[3].y).toBeCloseTo(PAPER_SIZES.A4.heightMm * 3, 6);
    // 底角到底部定位块中心的距离 = 底部中心内缩量 × 每毫米像素数。
    const bottomCenter = quad[3].y;
    const pxPerMm = (expanded[3].y - bottomCenter) / fiducialBottomInsetMm(PAPER_SIZES.A4.heightMm);
    expect(pxPerMm).toBeCloseTo(3, 6);
  });

  it('透视：四个角沿各自相邻边外扩，不退化成同一条水平线', () => {
    // 上边略短、整体轻微倾斜：模拟手持拍照的常见透视。
    const quad: FiducialQuad = [
      { x: 20, y: 40 },
      { x: 800, y: 30 },
      { x: 860, y: 1160 },
      { x: 8, y: 1156 },
    ];
    const expanded = expandFiducialQuad(quad, 'A4');
    expect(expanded).toHaveLength(4);
    for (const point of expanded) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    // 顶部两个角各自保留一点透视差，不会被拉平成同一条水平线。
    expect(Math.abs(expanded[0].y - expanded[1].y)).toBeGreaterThan(1);
    // 外扩后仍然是个凸四边形、面积更大。
    expect(expanded[2].x).toBeGreaterThan(quad[2].x);
    expect(expanded[0].x).toBeLessThan(quad[0].x);
    expect(expanded[1].y).toBeLessThan(quad[1].y);
    expect(expanded[3].y).toBeGreaterThan(quad[3].y);
  });

  it('退化四边形原样返回，交给调用方回退手动四角', () => {
    const degenerate = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(expandFiducialQuad(degenerate, 'A4')).toEqual(degenerate);
  });

  it('未知纸张按 A4 处理，不会抛错', () => {
    const expanded = expandFiducialQuad(axisAlignedA4(2), 'not-a-paper');
    expect(expanded[0].x).toBeCloseTo(0, 6);
  });
});

describe('页脚线常量', () => {
  it('A4 约 11mm、A5 约 8mm，且都在 8–11mm 之间', () => {
    expect(fiducialFooterInsetMm(297)).toBe(11);
    expect(fiducialFooterInsetMm(210)).toBe(8);
    for (const paper of Object.values(PAPER_SIZES)) {
      const inset = fiducialFooterInsetMm(paper.heightMm);
      expect(inset).toBeGreaterThanOrEqual(8);
      expect(inset).toBeLessThanOrEqual(11);
    }
  });

  it('底部定位块中心内缩 = 页脚线 + 半个块高', () => {
    expect(fiducialBottomInsetMm(297)).toBeCloseTo(11 + FIDUCIAL_SIZE_MM / 2, 6);
  });
});
