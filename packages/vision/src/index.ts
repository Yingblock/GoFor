/**
 * `@gofor/vision`：纸的回填所需的纯图像算法。
 *
 * 硬约束：零 DOM、零平台 API、零副作用（没有 Date.now / Math.random），
 * 因此可以在 Node 里被确定性测试。摄像头、Canvas、二维码解码都在宿主层。
 */
export { binarize } from './binarize.ts';
export { toGray } from './gray.ts';
export { inkCount, inkRatio } from './ink.ts';
export { otsuThreshold } from './otsu.ts';
export { detectPageQuad } from './page.ts';
export type { ImageDataLike, Point, Quad } from './types.ts';
export { identityQuad, warpQuad } from './warp.ts';
