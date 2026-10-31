import type { ImageDataLike } from '@gofor/vision';

/** 一张已经解码成像素的照片。`url` 是给 `<img>` 预览用的 object URL。 */
export interface LoadedPhoto {
  image: ImageDataLike;
  width: number;
  height: number;
  url: string;
}

/**
 * 把用户选中的照片解码成像素。
 *
 * 为什么在宿主层：`createImageBitmap` / Canvas 都是平台 API，`@gofor/vision` 里不许出现。
 * 大图先缩到最长边 2000px 再进算法——识别只需要"每个格子几十个像素"，
 * 原图 12MP 会让透视矫正慢得明显，而精度提升可以忽略。
 */
const MAX_EDGE = 2000;

function toImageDataLike(imageData: ImageData): ImageDataLike {
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

async function drawToImageData(bitmap: ImageBitmap | HTMLVideoElement): Promise<LoadedPhoto> {
  const sourceWidth = bitmap instanceof HTMLVideoElement ? bitmap.videoWidth : bitmap.width;
  const sourceHeight = bitmap instanceof HTMLVideoElement ? bitmap.videoHeight : bitmap.height;
  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('这一帧还没有画面');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('这个浏览器不支持 Canvas 2D，无法处理照片');
  context.drawImage(bitmap, 0, 0, width, height);

  return {
    image: toImageDataLike(context.getImageData(0, 0, width, height)),
    width,
    height,
    url: canvas.toDataURL('image/jpeg', 0.9),
  };
}

/** 从相册/文件选择一张纸的照片。 */
export async function loadPhotoFile(file: File): Promise<LoadedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    return await drawToImageData(bitmap);
  } finally {
    bitmap.close();
  }
}

/** 从摄像头当前帧抓一张（取景时用）。 */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<LoadedPhoto> {
  return drawToImageData(video);
}

/**
 * 打开后置摄像头。
 *
 * 桌面浏览器常常没有摄像头，或者需要 https/localhost；调用方必须准备好
 * "上传照片"的退化路径，**不能假设它一定成功**。
 */
export async function openCamera(): Promise<MediaStream> {
  if (!('mediaDevices' in navigator) || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw new Error('这个环境没有摄像头接口，请改用「选照片」');
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
}
