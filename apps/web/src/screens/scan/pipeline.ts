import { PAPER_SIZES, type PaperId } from '@gofor/core/print';
import { decodeQr, type FillLink, parseFillLink } from '@gofor/core/scan';
import {
  binarize,
  type ImageDataLike,
  type Quad,
  toGray,
  inkRatio as visionInkRatio,
  warpQuad,
} from '@gofor/vision';

/** 矫正后的目标宽度（像素）。1000 宽对 A4 来说每格约 40px，足够判"有没有墨"。 */
const WARP_WIDTH = 1000;

export type ReadSheetResult =
  | {
      ok: true;
      link: FillLink;
      /** 透视矫正后的整页（RGBA）。 */
      page: ImageDataLike;
      /** 整页的二值图（1 = 墨迹），与 `page` 同尺寸。 */
      binary: Uint8Array;
    }
  | { ok: false; reason: string };

/**
 * 从一张纸的照片里读出二维码（这一步**在矫正之前**做）。
 *
 * 为什么先解二维码：矫正后的目标尺寸取决于纸张比例，而纸张 id 就写在二维码里。
 * 先矫正再解码会陷入循环依赖；二维码本身对透视不敏感，jsQR 能直接从原图解出来。
 */
export function readLinkFromPhoto(image: ImageDataLike): FillLink | null {
  const text = decodeQr(image.data, image.width, image.height);
  if (text === null) return null;
  const parsed = parseFillLink(text);
  return parsed.ok ? parsed.value : null;
}

/** 纸张比例（宽/高）。用于决定矫正后的画布尺寸。 */
function paperAspect(paper: string): number {
  const size = PAPER_SIZES[paper as PaperId];
  if (!size) return 210 / 297; // 认不出的纸张按 A4 兜底，至少不会崩
  return size.widthMm / size.heightMm;
}

/**
 * 把照片里的纸矫正成"正面整页"。
 *
 * 输出宽固定 1000px、高按纸张比例算：坐标清单里的矩形是**归一化**的，
 * 所以只要长宽比正确，像素密度不影响命中。
 */
export function warpToPage(image: ImageDataLike, quad: Quad, paper: string): ImageDataLike {
  const aspect = paperAspect(paper);
  const width = WARP_WIDTH;
  const height = Math.max(1, Math.round(WARP_WIDTH / aspect));
  return warpQuad(image, quad, width, height);
}

/** 整页二值化（Otsu 自动阈值）。 */
export function binaryOfPage(page: ImageDataLike): Uint8Array {
  return binarize(toGray(page));
}

/**
 * 完整链路：原图 + 四角 + （从二维码读到的）纸张 → 矫正后的整页与二值图。
 *
 * `paper` 允许不传：调用方可能已经解出链接，也可能让用户手选了纸张。
 */
export function readSheet(image: ImageDataLike, quad: Quad, paper: string): ReadSheetResult {
  const link = readLinkFromPhoto(image);
  if (link === null) {
    return {
      ok: false,
      reason: '照片里没找到这张纸的二维码。确认纸是程序打印的、二维码没被裁掉或反光。',
    };
  }
  const page = warpToPage(image, quad, paper === '' ? link.paper : paper);
  return { ok: true, link, page, binary: binaryOfPage(page) };
}

/**
 * 按坐标清单采样：归一化矩形 → 墨迹占比。
 *
 * 直接复用 `@gofor/vision` 的 `inkRatio`，不在宿主层重写一遍坐标换算；
 * 这里只负责把"页面像素尺寸"补进参数。
 */
export function sampleTargets(
  binary: Uint8Array,
  page: ImageDataLike,
  targets: readonly { targetId: string; rect: { x: number; y: number; w: number; h: number } }[],
): { targetId: string; ink: number }[] {
  return targets.map((target) => ({
    targetId: target.targetId,
    ink: visionInkRatio(binary, page.width, page.height, target.rect),
  }));
}
