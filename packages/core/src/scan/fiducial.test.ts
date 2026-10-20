import { describe, expect, it } from 'vitest';
import {
  FIDUCIAL_SIZE_MM,
  fiducialBottomTopMm,
  fiducialFooterInsetMm,
  PAPER_SIZES,
} from '../print/index.ts';
import { expandFiducialQuad, type FiducialQuad } from './fiducial.ts';

/** 以 pxPerMm 生成 A4 正对镜头时的四个定位块中心（TL/TR/BR/BL）。 */
function axisAlignedA4(pxPerMm: number, bottomTopMm = A4_BOTTOM_TOP): FiducialQuad {
  const paper = PAPER_SIZES.A4;
  const top = 5.5;
  const side = 5.5;
  const bottomCenter = bottomTopMm + FIDUCIAL_SIZE_MM / 2;
  return [
    { x: side * pxPerMm, y: top * pxPerMm },
    { x: (paper.widthMm - side) * pxPerMm, y: top * pxPerMm },
    { x: (paper.widthMm - side) * pxPerMm, y: bottomCenter * pxPerMm },
    { x: side * pxPerMm, y: bottomCenter * pxPerMm },
  ];
}

/** A4「我的一天」正文底部 286mm → 页尾条码/定位点顶端 287mm（安全线 286mm）。 */
const A4_BOTTOM_TOP = fiducialBottomTopMm(278 + 8, PAPER_SIZES.A4.heightMm);

describe('定位块外扩：非对称页脚', () => {
  it('A4 正对镜头：外扩后正好是纸角（上下内缩不同）', () => {
    const pxPerMm = 4;
    const quad = expandFiducialQuad(axisAlignedA4(pxPerMm), 'A4', { bottomTopMm: A4_BOTTOM_TOP });
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

  it('下方定位块更靠里：按清单给的底部位置外扩，底角仍对到纸底边', () => {
    const quad = axisAlignedA4(3, A4_BOTTOM_TOP);
    const expanded = expandFiducialQuad(quad, 'A4', { bottomTopMm: A4_BOTTOM_TOP });
    expect(expanded[3].y).toBeCloseTo(PAPER_SIZES.A4.heightMm * 3, 6);
    const bottomInset = PAPER_SIZES.A4.heightMm - A4_BOTTOM_TOP - FIDUCIAL_SIZE_MM / 2;
    const bottomCenter = quad[3].y;
    const pxPerMm = (expanded[3].y - bottomCenter) / bottomInset;
    expect(pxPerMm).toBeCloseTo(3, 6);
  });

  it('底部定位点跟着条码上移时，外扩也随之上移（短模板）', () => {
    // 例：本周计划的正文底部约 243mm → 定位点顶端 244mm。
    const bottomTop = fiducialBottomTopMm(243, PAPER_SIZES.A4.heightMm);
    expect(bottomTop).toBe(244);
    const quad = axisAlignedA4(3, bottomTop);
    const expanded = expandFiducialQuad(quad, 'A4', { bottomTopMm: bottomTop });
    expect(expanded[3].y).toBeCloseTo(PAPER_SIZES.A4.heightMm * 3, 6);
  });

  it('旧纸没有底部几何时按对称 5.5mm 外扩（保持旧行为）', () => {
    const oldQuad = axisAlignedA4(3, PAPER_SIZES.A4.heightMm - 5.5 - FIDUCIAL_SIZE_MM / 2);
    const expanded = expandFiducialQuad(oldQuad, 'A4');
    expect(expanded[3].y).toBeCloseTo(PAPER_SIZES.A4.heightMm * 3, 6);
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

  it('fiducialBottomTopMm 取「条码位置」与「页脚安全线」的较小值', () => {
    // 正文底部 286mm → 条码 287mm，但安全线是 286mm（A4），取 286。
    expect(fiducialBottomTopMm(286, 297)).toBe(286);
    // 短模板：正文底部 57mm → 58mm，远高于安全线，跟着条码走。
    expect(fiducialBottomTopMm(57, 297)).toBe(58);
  });
});
