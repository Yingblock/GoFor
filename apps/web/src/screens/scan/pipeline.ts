import { BLOCK_MARK_SIZE_MM, PAPER_SIZES, type PaperId } from '@gofor/core/print';
import {
  decodeCode128Row,
  decodeQrLocated,
  expandFiducialQuad,
  type FillLink,
  type ManifestBlock,
  parseFillLink,
  parseSheetCode,
  type SheetCode,
} from '@gofor/core/scan';
import {
  binarize,
  findFiducialQuad,
  findMarkNear,
  type ImageDataLike,
  type Quad,
  toGray,
  inkRatio as visionInkRatio,
  warpQuad,
} from '@gofor/vision';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/** 矫正后的目标宽度（像素）。1000 宽对 A4 来说每格约 40px，足够判"有没有墨"。 */
const WARP_WIDTH = 1000;

/**
 * 条码矫正用的正方形边长（像素）。
 *
 * 条码解码不需要正确的纸张比例，只需要"条是横的"；用正方形把四边形拉平，
 * 可以省掉"先知道纸张才能矫正"的循环依赖。照片在进算法前已缩到最长边 2000px，
 * 正方形 2000 对 A4 来说约 6.7px/mm，0.6mm 的模块还有 4px，够解。
 */
const BARCODE_WARP = 2000;

export type ReadSheetResult =
  | {
      ok: true;
      /** 身份来自二维码（完整深链）。 */
      source: 'qr';
      link: FillLink;
      /** 透视矫正后的整页（RGBA）。 */
      page: ImageDataLike;
      /** 整页的二值图（1 = 墨迹），与 `page` 同尺寸。 */
      binary: Uint8Array;
      /** 0 起的页号。二维码只印在第 1 页，所以是 0。 */
      pageIndex: number;
    }
  | {
      ok: true;
      /** 身份来自条码（短码：日期 + 纸张 + 模板短码 + 页号）。 */
      source: 'barcode';
      code: SheetCode;
      page: ImageDataLike;
      binary: Uint8Array;
      /** 条码里带页号，条码印在每一页的页尾。 */
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
 * 定位块中心四角 → 真实纸角（实现在 `@gofor/core/scan` 的 `expandFiducialQuad`）。
 *
 * 上下内缩量不再对称：下方定位块为避开打印机不可打印区，和页尾条码一起上移到
 * 页脚线；core 里按每条边的实际方向外扩，扫描端与打印端共用同一组常量。
 */

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

/**
 * 条码兜底：把四角拉成正方形，逐行找 Code 128。
 *
 * 为什么逐行：条码是一维的，只要有一行完整穿过它就能解。照片可能有轻微旋转、
 * 透视，按行扫描比"先定位条码区域再解"简单得多，也不依赖条码印在哪一页。
 * 行距 2px：条码高度约 4.6mm，在 2000px 的照片里约 30px，不会漏。
 *
 * 这条路径天然受四角约束（只在框出的纸里找），不会像二维码那样从整张照片抓码。
 */
export function readBarcodeFromPhoto(image: ImageDataLike, quad: Quad): SheetCode | null {
  const square = warpQuad(image, quad, BARCODE_WARP, BARCODE_WARP);
  const binary = binarize(toGray(square));
  const width = square.width;
  const row = new Uint8Array(width);

  for (let y = 0; y < square.height; y += 2) {
    const base = y * width;
    for (let x = 0; x < width; x += 1) {
      row[x] = binary[base + x] === 1 ? 1 : 0;
    }
    const text = decodeCode128Row(row);
    if (text === null) continue;
    const code = parseSheetCode(text);
    if (code !== null) return code;
  }
  return null;
}

/**
 * ZXing 1D 解码（P2-2.12）。
 *
 * 为什么不再自己扫行：手写解码要求条码几乎水平、模块 ≥4px、逐行对齐，
 * 真实照片里一有旋转/透视/光照不均就废。ZXing 是成熟实现，内部会多行采样、
 * 局部二值化、TRY_HARDER 重试；实测用户的两张真实照片（1440×1920、1080×2340，
 * 轻微旋转 + 反光）都能在原生分辨率直接解出。
 *
 * 不依赖四角矫正：直接吃原图，解出后用结果点做"是否在框内"校验（见 readSheet）。
 */
interface BarcodeHit {
  text: string;
  /** 解码结果在**原图**里的中心点；ZXing 没给点时是 undefined。 */
  center?: { x: number; y: number };
}

function resolveBarcodeCenter(
  points: readonly { getX(): number; getY(): number }[] | null | undefined,
  offsetX = 0,
  offsetY = 0,
): { x: number; y: number } | undefined {
  if (points === null || points === undefined || points.length === 0) return undefined;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.getX();
    sumY += point.getY();
  }
  return { x: sumX / points.length + offsetX, y: sumY / points.length + offsetY };
}

/** RGBA → ZXing 要的 ARGB Int32 像素。 */
function toArgb(image: ImageDataLike): Int32Array {
  const pixels = new Int32Array(image.width * image.height);
  const data = image.data;
  for (let index = 0; index < pixels.length; index += 1) {
    const base = index * 4;
    pixels[index] =
      (255 << 24) |
      ((data[base] ?? 0) << 16) |
      ((data[base + 1] ?? 0) << 8) |
      (data[base + 2] ?? 0);
  }
  return pixels;
}

function decodeWithZxing(
  image: ImageDataLike,
  formats: readonly BarcodeFormat[],
  offset?: { x: number; y: number },
): BarcodeHit | null {
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [...formats]);
  try {
    const source = new RGBLuminanceSource(toArgb(image), image.width, image.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decode(bitmap, hints);
    const center = resolveBarcodeCenter(result.getResultPoints(), offset?.x, offset?.y);
    return center === undefined ? { text: result.getText() } : { text: result.getText(), center };
  } catch {
    // NotFoundException / FormatException / ChecksumException：都按"这张图里没有"处理。
    return null;
  }
}

/** 把整图旋转 180°；手机横竖拿反时条码是倒的，ZXing 的 1D reader 不会自己转。 */
function rotate180(image: ImageDataLike): ImageDataLike {
  const width = image.width;
  const height = image.height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = ((height - 1 - y) * width + (width - 1 - x)) * 4;
      const source = (y * width + x) * 4;
      data[target] = image.data[source] ?? 0;
      data[target + 1] = image.data[source + 1] ?? 0;
      data[target + 2] = image.data[source + 2] ?? 0;
      data[target + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * 条码兜底：ZXing 先解原图，失败再用半分辨率（有些手机把码拍得很细，
 * 降采样能消掉 JPEG 振铃），最后试一次 180°。
 *
 * 返回值里的 `center` 已换算回原图坐标，调用方据此判断"码是不是在框里"。
 */
function decodeBarcodeFromPhoto(image: ImageDataLike): BarcodeHit | null {
  const direct = decodeWithZxing(image, [BarcodeFormat.CODE_128]);
  if (direct !== null) return direct;

  const halved = downscaleRgba(image, 2);
  const halfHit = decodeWithZxing(halved, [BarcodeFormat.CODE_128]);
  if (halfHit !== null) {
    return {
      text: halfHit.text,
      ...(halfHit.center === undefined
        ? {}
        : { center: { x: halfHit.center.x * 2, y: halfHit.center.y * 2 } }),
    };
  }

  const flipped = rotate180(image);
  const flippedHit = decodeWithZxing(flipped, [BarcodeFormat.CODE_128]);
  if (flippedHit !== null) {
    return {
      text: flippedHit.text,
      ...(flippedHit.center === undefined
        ? {}
        : {
            center: {
              x: image.width - 1 - flippedHit.center.x,
              y: image.height - 1 - flippedHit.center.y,
            },
          }),
    };
  }
  return null;
}

/**
 * 从照片里找四角定位块（P2-2.17）。
 *
 * 返回的是**原图像素坐标**；找不到返回 null，由调用方回退手动四角。
 * 这一步不依赖纸张尺寸/二维码，所以能在矫正之前跑。
 */
export function readFiducialQuad(image: ImageDataLike): Quad | null {
  return findFiducialQuad(binarize(toGray(image)), image.width, image.height);
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
 * 完整链路：原图 + 四角 → 二维码或条码 → 矫正后的整页与二值图。
 *
 * 顺序刻意是"先二维码，再条码"：
 * - 二维码带完整模板 id，能直接定位坐标清单；
 * - 条码载荷短，先解出来也能反查清单（短码 → 模板 + 日期 + 纸张 + 页）。
 *
 * `paper` 允许不传：调用方可能已经解出链接，也可能让用户手选了纸张。
 */
export function readSheet(
  image: ImageDataLike,
  quad: Quad,
  paper: string,
  options: { fiducialQuad?: boolean } = {},
): ReadSheetResult {
  const located = decodeQrMultiScale(image);
  let qrOutsideFrame = false;

  if (located !== null) {
    if (isAroundQuad(located.center, quad)) {
      const parsed = parseFillLink(located.text);
      if (parsed.ok) {
        const link = parsed.value;
        const effectivePaper = paper === '' ? link.paper : paper;
        const effectiveQuad =
          options.fiducialQuad === true ? expandFiducialQuad(quad, effectivePaper) : quad;
        const page = warpToPage(image, effectiveQuad, effectivePaper);
        return {
          ok: true,
          source: 'qr',
          link,
          page,
          binary: binaryOfPage(page),
          pageIndex: 0,
        };
      }
    } else {
      qrOutsideFrame = true;
    }
  }

  // 1) ZXing：吃原图，抗旋转/透视/光照；解出后再按四角框做位置校验。
  const zxingHit = decodeBarcodeFromPhoto(image);
  if (zxingHit !== null) {
    const code = parseSheetCode(zxingHit.text);
    if (code !== null && (zxingHit.center === undefined || isAroundQuad(zxingHit.center, quad))) {
      const effectiveQuad =
        options.fiducialQuad === true ? expandFiducialQuad(quad, code.paper) : quad;
      const page = warpToPage(image, effectiveQuad, code.paper);
      return {
        ok: true,
        source: 'barcode',
        code,
        page,
        binary: binaryOfPage(page),
        pageIndex: code.page - 1,
      };
    }
  }

  // 2) 自己写的解码器兜底（清晰的截图/扫描件；真实照片基本走不到这里）。
  const code = readBarcodeFromPhoto(image, quad);
  if (code !== null) {
    const effectiveQuad =
      options.fiducialQuad === true ? expandFiducialQuad(quad, code.paper) : quad;
    const page = warpToPage(image, effectiveQuad, code.paper);
    return {
      ok: true,
      source: 'barcode',
      code,
      page,
      binary: binaryOfPage(page),
      pageIndex: code.page - 1,
    };
  }

  return {
    ok: false,
    reason: qrOutsideFrame
      ? '照片里的二维码在你框出的纸张范围之外，没有用它；纸尾也没找到条码。' +
        '把四个角拖到纸边再试，或者重拍一张。'
      : '照片里没找到这张纸的二维码，也没找到页尾条码。' +
        '确认纸是程序打印的、码没被裁掉或反光；纸摆正一点再试。',
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

type RectTarget = { targetId: string; rect: { x: number; y: number; w: number; h: number } };

/**
 * 区块级局部校正（P2-2.17 v2）：用每个区块印在行距里的两个对角小十字，
 * 把这一块的采样窗再对齐一次。
 *
 * 页面级透视矫正只解决"整张纸"的形变；纸张局部拉伸、扫描仪边缘畸变、手机镜头畸变
 * 会让下半页/边角整体偏移 1–3mm。页面坐标清单是按"理想纸面"算的，offset 超过半个
 * 勾选框就会漏读/误读。这里对每一块单独求「平移 + 等比缩放」（两个点足够），
 * 找不到小点（旧纸、反光、裁边）就保持原坐标，绝不因此报错。
 */
export function refineTargetsByBlockMarks<T extends RectTarget>(
  binary: Uint8Array,
  page: ImageDataLike,
  manifestPage: {
    widthMm: number;
    heightMm: number;
    blocks?: readonly ManifestBlock[] | undefined;
  },
  targets: readonly T[],
): readonly T[] {
  const blocks = manifestPage.blocks;
  if (blocks === undefined || blocks.length === 0) return targets;

  const pxPerMm = page.width / manifestPage.widthMm;
  const markPx = BLOCK_MARK_SIZE_MM * pxPerMm;
  const radiusPx = Math.max(4, Math.round(3 * pxPerMm));
  const minBoxPx = Math.max(2, Math.round(markPx * 0.4));
  const maxBoxPx = Math.max(4, Math.round(markPx * 1.9));

  interface Correction {
    expected: { x: number; y: number };
    detected: { x: number; y: number };
    cos: number;
    sin: number;
    scale: number;
  }
  const corrections = new Map<string, Correction>();

  for (const block of blocks) {
    const expectedTop = {
      x: block.marks.top.x * page.width,
      y: block.marks.top.y * page.height,
    };
    const expectedBottom = {
      x: block.marks.bottom.x * page.width,
      y: block.marks.bottom.y * page.height,
    };
    const detectedTop = findMarkNear(binary, page.width, page.height, expectedTop, {
      radiusPx,
      minBoxPx,
      maxBoxPx,
    });
    const detectedBottom = findMarkNear(binary, page.width, page.height, expectedBottom, {
      radiusPx,
      minBoxPx,
      maxBoxPx,
    });
    if (detectedTop === null || detectedBottom === null) continue;

    const ex = expectedBottom.x - expectedTop.x;
    const ey = expectedBottom.y - expectedTop.y;
    const dx = detectedBottom.x - detectedTop.x;
    const dy = detectedBottom.y - detectedTop.y;
    const expectedLength = Math.hypot(ex, ey);
    if (expectedLength < 1) continue;
    const scale = Math.hypot(dx, dy) / expectedLength;
    // 只接受"看起来还是同一块纸"的校正：缩放离谱或平移超过搜索半径，多半认错了墨迹。
    if (scale < 0.8 || scale > 1.25) continue;
    if (Math.hypot(detectedTop.x - expectedTop.x, detectedTop.y - expectedTop.y) > radiusPx * 1.5) {
      continue;
    }
    const rotation = Math.atan2(dy, dx) - Math.atan2(ey, ex);
    corrections.set(block.id, {
      expected: expectedTop,
      detected: detectedTop,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
      scale,
    });
  }

  if (corrections.size === 0) return targets;

  return targets.map((target) => {
    const blockId = (target as { blockId?: string }).blockId;
    if (blockId === undefined) return target;
    const correction = corrections.get(blockId);
    if (correction === undefined) return target;

    const centerX = (target.rect.x + target.rect.w / 2) * page.width;
    const centerY = (target.rect.y + target.rect.h / 2) * page.height;
    const localX = (centerX - correction.expected.x) * correction.scale;
    const localY = (centerY - correction.expected.y) * correction.scale;
    const mappedX = correction.detected.x + localX * correction.cos - localY * correction.sin;
    const mappedY = correction.detected.y + localX * correction.sin + localY * correction.cos;
    const scaledW = target.rect.w * correction.scale;
    const scaledH = target.rect.h * correction.scale;
    return {
      ...target,
      rect: {
        x: mappedX / page.width - scaledW / 2,
        y: mappedY / page.height - scaledH / 2,
        w: scaledW,
        h: scaledH,
      },
    };
  });
}
