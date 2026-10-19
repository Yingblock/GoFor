import { PAPER_SIZES, type PaperId } from '@gofor/core/print';
import { decodeQrLocated, type FillLink, parseFillLink } from '@gofor/core/scan';
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
      /** 0 起的页号。现在只认第 1 页（二维码只印在首页）。 */
      pageIndex: number;
    }
  | { ok: false; reason: string };

/**
 * 整张图按整数倍缩小（块平均）。
 *
 * 为什么要缩：二维码在照片里只占很小一块，jsQR 的定位对"图很大、码很小"
 * 不总是稳；同一张图缩一半/四分之一再试，相当于换一个尺度看它，
 * 成本远小于让用户重拍。
 */
function downscaleRgba(image: ImageDataLike, factor: number): ImageDataLike {
  const width = Math.max(1, Math.floor(image.width / factor));
  const height = Math.max(1, Math.floor(image.height / factor));
  const data = new Uint8ClampedArray(width * height * 4);
  const source = image.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sy = y * factor + dy;
        if (sy >= image.height) break;
        const rowBase = sy * image.width;
        for (let dx = 0; dx < factor; dx += 1) {
          const sx = x * factor + dx;
          if (sx >= image.width) break;
          const base = (rowBase + sx) * 4;
          r += source[base] ?? 0;
          g += source[base + 1] ?? 0;
          b += source[base + 2] ?? 0;
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      if (count === 0) continue;
      data[target] = r / count;
      data[target + 1] = g / count;
      data[target + 2] = b / count;
      data[target + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 二维码中心允许超出四角框的范围：按框的宽高各放宽 10%。 */
const QR_AREA_TOLERANCE = 0.1;

/**
 * 多尺度解码二维码：原图 → 1/2 → 1/4 → 1/8，第一个成功为止。
 *
 * 只缩不放：再放大只会更慢，而且原图已经是最清晰的一份。
 * 缩到短边小于 200px 就停，那个尺度下二维码已经糊成一团。
 *
 * 返回的 `center` 已换算回**原图**像素坐标，调用方不用关心试过哪个尺度。
 */
function decodeQrMultiScale(
  image: ImageDataLike,
): { text: string; center: { x: number; y: number } } | null {
  const direct = decodeQrLocated(image.data, image.width, image.height);
  if (direct !== null) return { text: direct.data, center: direct.center };

  for (const factor of [2, 4, 8]) {
    if (Math.min(image.width, image.height) / factor < 200) break;
    const scaled = downscaleRgba(image, factor);
    const decoded = decodeQrLocated(scaled.data, scaled.width, scaled.height);
    if (decoded !== null) {
      return {
        text: decoded.data,
        center: { x: decoded.center.x * factor, y: decoded.center.y * factor },
      };
    }
  }
  return null;
}

/**
 * 二维码中心是否落在用户框出的纸张范围里（允许 10% 外溢）。
 *
 * 为什么要这道判断：二维码解码跑在**整张照片**上——这是刻意的，因为"纸张尺寸"
 * 本身写在二维码里，先矫正再解码会循环依赖。代价是同一张照片里若还有另一张纸、
 * 或屏幕上的另一个二维码，jsQR 可能解出别人的码，日期/模板就全错了。
 * 所以解码后按四角框做一次位置校验：明显在框外的码不认。
 *
 * 用外接矩形而不是严格多边形：照片里的纸通常接近矩形，放宽一点可以容忍
 * 「角没拖到纸边」「纸角被手指挡住」这些常见情况，只拒绝明显跑到框外的码。
 */
function isAroundQuad(point: { x: number; y: number }, quad: Quad): boolean {
  const xs = quad.map((corner) => corner.x);
  const ys = quad.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * QR_AREA_TOLERANCE;
  const padY = (maxY - minY) * QR_AREA_TOLERANCE;
  return (
    point.x >= minX - padX &&
    point.x <= maxX + padX &&
    point.y >= minY - padY &&
    point.y <= maxY + padY
  );
}

/**
 * 从一张纸的照片里读出二维码（这一步**在矫正之前**做）。
 *
 * 为什么先解二维码：矫正后的目标尺寸取决于纸张比例，而纸张 id 就写在二维码里。
 * 先矫正再解码会陷入循环依赖；二维码本身对透视不敏感，jsQR 能直接从原图解出来。
 *
 * 传了 `quad` 时会拒绝"明显在框外"的二维码（见 `isAroundQuad`）；
 * 不传就退化成"图里任意位置"，只给不需要位置校验的调用方用。
 */
export function readLinkFromPhoto(image: ImageDataLike, quad?: Quad): FillLink | null {
  const located = decodeQrMultiScale(image);
  if (located === null) return null;
  if (quad !== undefined && !isAroundQuad(located.center, quad)) return null;
  const parsed = parseFillLink(located.text);
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
 * 完整链路：原图 + 四角 → 二维码 → 矫正后的整页与二值图。
 *
 * `paper` 允许不传：调用方可能已经解出链接，也可能让用户手选了纸张。
 */
export function readSheet(image: ImageDataLike, quad: Quad, paper: string): ReadSheetResult {
  const located = decodeQrMultiScale(image);
  if (located === null) {
    return {
      ok: false,
      reason:
        '照片里没找到这张纸的二维码。确认纸是程序打印的、二维码没被裁掉或反光；纸摆正一点再试。',
    };
  }

  if (!isAroundQuad(located.center, quad)) {
    return {
      ok: false,
      reason:
        '照片里的二维码在你框出的纸张范围之外，没有用它。' +
        '如果框错了，把四个角拖到纸边再试；也可以重拍一张，让二维码留在框里。',
    };
  }

  const parsed = parseFillLink(located.text);
  if (!parsed.ok) {
    return { ok: false, reason: `纸上的二维码读不懂：${parsed.reason}` };
  }

  const link = parsed.value;
  const page = warpToPage(image, quad, paper === '' ? link.paper : paper);
  return {
    ok: true,
    link,
    page,
    binary: binaryOfPage(page),
    pageIndex: 0,
  };
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
