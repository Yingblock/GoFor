/**
 * 视觉管线的最小数据契约。
 *
 * 这里刻意不 import 任何 DOM 类型：`ImageDataLike` 只认 width/height/data(RGBA)，
 * 浏览器里的 `ImageData` 可以直接传进来，Node 里手搓一个对象也能测。
 */

/** 与浏览器 `ImageData` 同形，但零 DOM 依赖：只认 width/height/data(RGBA)。 */
export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA，长度 = width*height*4
}

export interface Point {
  x: number;
  y: number;
}

/** 四边形，顺序：左上、右上、右下、左下（顺时针）。 */
export type Quad = [Point, Point, Point, Point];
