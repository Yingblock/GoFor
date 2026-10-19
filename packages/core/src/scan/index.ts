/**
 * 扫码回填：纯逻辑与算法，不碰 UI、不碰摄像头像素采集。
 *
 * 分工：
 * - `deeplink.ts`：二维码里写什么（模板 id + 日期 + 纸张）；
 * - `qr.ts`：生成模块矩阵/SVG 路径，从图像解码；
 * - `barcode.ts`：Code 128 条码 + 16 字符纸面短码（二维码的拍照兜底）；
 * - `manifest.ts`：模板坐标注册表（每个可回填格子的归一化坐标）；
 * - `classify.ts`：把墨迹占比读数判成"勾没勾"。
 */

export {
  decodeCode128Row,
  encodeCode128,
  encodeSheetCode,
  parseSheetCode,
  type SheetCode,
  sheetCodeToken,
} from './barcode.ts';
export {
  type ClassifyOptions,
  classifyInk,
  DEFAULT_INK_THRESHOLD,
  type InkReading,
} from './classify.ts';
export {
  buildFillLink,
  type FillLink,
  type ParseFillLinkResult,
  parseFillLink,
} from './deeplink.ts';

export {
  buildSheetManifest,
  type ManifestInput,
  type ScanTarget,
  type SheetManifest,
} from './manifest.ts';

export {
  decodeQr,
  decodeQrFromGray,
  decodeQrLocated,
  encodeQrMatrix,
  encodeQrSvgPath,
  type LocatedQr,
  type QrMatrix,
} from './qr.ts';
