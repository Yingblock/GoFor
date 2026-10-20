/**
 * 定位块几何：把照片里找到的四个定位块中心外扩成真实纸角。
 *
 * 打印时上方/左右定位块离页边 `FIDUCIAL_OFFSET_MM`（中心 5.5mm），
 * 下方定位块为了避开打印机最下方不可打印区，和页尾条码一样上移到「页脚线」
 * （`fiducialFooterInsetMm`，A4 约 11mm）。所以**上下内缩量不再对称**，
 * 外扩必须分开算——以前按 `W/(W-11)、H/(H-11)` 对称缩放，下方会多缩几毫米，
 * 整页坐标纵向偏移，采样窗就会压到格子边缘。
 *
 * 这里按每条边的实际方向做外扩（保留透视：四个角各自沿相邻两边的方向后退），
 * 而不是绕中心整体缩放。纯函数、无平台依赖，可单测。
 */

import { FIDUCIAL_INSET_MM, fiducialBottomInsetMm } from '../print/blocks.ts';
import { PAPER_SIZES, type PaperId } from '../print/paper.ts';

export interface FiducialPoint {
  x: number;
  y: number;
}

/** TL / TR / BR / BL 顺序，与 `findFiducialQuad` 的输出一致。 */
export type FiducialQuad = [FiducialPoint, FiducialPoint, FiducialPoint, FiducialPoint];

interface Vector {
  x: number;
  y: number;
}

function sub(to: FiducialPoint, from: FiducialPoint): Vector {
  return { x: to.x - from.x, y: to.y - from.y };
}

function length(vector: Vector): number {
  return Math.hypot(vector.x, vector.y);
}

function unit(vector: Vector): Vector | null {
  const len = length(vector);
  if (len < 1e-6 || !Number.isFinite(len)) return null;
  return { x: vector.x / len, y: vector.y / len };
}

function step(origin: FiducialPoint, direction: Vector, px: number): FiducialPoint {
  return { x: origin.x + direction.x * px, y: origin.y + direction.y * px };
}

/**
 * 定位块中心四角 → 真实纸角（TL/TR/BR/BL）。
 *
 * 参数是照片像素坐标；返回同一坐标系里的纸角，可直接交给 `warpQuad`。
 * 纸张 id 不认识时按 A4 处理（和旧实现一致）；四角退化（边长≈0）时原样返回，
 * 让调用方回退到手动四角，而不是算出 NaN。
 */
export function expandFiducialQuad(quad: readonly FiducialPoint[], paper: string): FiducialQuad {
  const size = PAPER_SIZES[paper as PaperId] ?? PAPER_SIZES.A4;
  const topInset = FIDUCIAL_INSET_MM;
  const sideInset = FIDUCIAL_INSET_MM;
  const bottomInset = fiducialBottomInsetMm(size.heightMm);

  const [tl, tr, br, bl] = quad as readonly [
    FiducialPoint,
    FiducialPoint,
    FiducialPoint,
    FiducialPoint,
  ];

  const topEdge = sub(tr, tl);
  const bottomEdge = sub(br, bl);
  const leftEdge = sub(bl, tl);
  const rightEdge = sub(br, tr);
  const topDir = unit(topEdge);
  const bottomDir = unit(bottomEdge);
  const leftDir = unit(leftEdge);
  const rightDir = unit(rightEdge);

  const horizSpanMm = size.widthMm - sideInset * 2;
  const vertSpanMm = size.heightMm - topInset - bottomInset;
  const topLen = length(topEdge);
  const bottomLen = length(bottomEdge);
  const leftLen = length(leftEdge);
  const rightLen = length(rightEdge);

  if (
    topDir === null ||
    bottomDir === null ||
    leftDir === null ||
    rightDir === null ||
    horizSpanMm <= 0 ||
    vertSpanMm <= 0
  ) {
    return [tl, tr, br, bl];
  }

  // 每条边「每毫米多少像素」；透视下左右/上下各算各的，不假设整页均匀缩放。
  const topPxPerMm = topLen / horizSpanMm;
  const bottomPxPerMm = bottomLen / horizSpanMm;
  const leftPxPerMm = leftLen / vertSpanMm;
  const rightPxPerMm = rightLen / vertSpanMm;

  const expand = (
    point: FiducialPoint,
    vertical: { dir: Vector; pxPerMm: number; mm: number; sign: 1 | -1 },
    horizontal: { dir: Vector; pxPerMm: number; mm: number; sign: 1 | -1 },
  ): FiducialPoint => {
    const afterVertical = step(point, vertical.dir, vertical.mm * vertical.pxPerMm * vertical.sign);
    return step(
      afterVertical,
      horizontal.dir,
      horizontal.mm * horizontal.pxPerMm * horizontal.sign,
    );
  };

  return [
    expand(
      tl,
      { dir: leftDir, pxPerMm: leftPxPerMm, mm: topInset, sign: -1 },
      {
        dir: topDir,
        pxPerMm: topPxPerMm,
        mm: sideInset,
        sign: -1,
      },
    ),
    expand(
      tr,
      { dir: rightDir, pxPerMm: rightPxPerMm, mm: topInset, sign: -1 },
      {
        dir: topDir,
        pxPerMm: topPxPerMm,
        mm: sideInset,
        sign: 1,
      },
    ),
    expand(
      br,
      { dir: rightDir, pxPerMm: rightPxPerMm, mm: bottomInset, sign: 1 },
      {
        dir: bottomDir,
        pxPerMm: bottomPxPerMm,
        mm: sideInset,
        sign: 1,
      },
    ),
    expand(
      bl,
      { dir: leftDir, pxPerMm: leftPxPerMm, mm: bottomInset, sign: 1 },
      {
        dir: bottomDir,
        pxPerMm: bottomPxPerMm,
        mm: sideInset,
        sign: -1,
      },
    ),
  ];
}
