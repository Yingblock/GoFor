/**
 * 把墨迹读数判成"勾了没有"。
 *
 * 这是 DESIGN §3.3 的最后一步：每个格子已经有局部采样算出的墨迹占比（0–1），
 * 这里只做阈值判定，不做任何图像处理。阈值允许调用方覆盖（设置里的"激进/保守"）。
 *
 * 一条容易犯的错：**没有读数的格子也必须出现在结果里**，记 `ink: 0, selected: false`。
 * 否则"这一行没扫到（比如被手挡住/透视裁掉了）"和"这一行没勾"在结果里长得一模一样，
 * 用户会以为系统读过了，静默漏掉一次勾选。
 */

import type { ScanResult } from '../domain/entities.ts';
import type { SheetManifest } from './manifest.ts';

/** 默认墨迹阈值：18% 前景像素算"勾了"。 */
export const DEFAULT_INK_THRESHOLD = 0.18;

export interface InkReading {
  targetId: string;
  /** 0–1；取值超出范围会被夹到边界，NaN 按 0。 */
  ink: number;
}

export interface ClassifyOptions {
  /** 覆盖默认阈值；设置里的"激进/保守"就改这个。 */
  threshold?: number;
}

/**
 * 逐 target 判定。
 *
 * - 结果顺序 = 注册表里 target 的顺序（纸面顺序），方便确认列表从上到下列；
 * - 同一 target 有多条读数时**后一条覆盖前一条**（上游可能重试采样）；
 * - 注册表里没有的 targetId 直接忽略：没有 label/kind，写库层也没法用。
 */
export function classifyInk(
  manifest: SheetManifest,
  readings: readonly InkReading[],
  options: ClassifyOptions = {},
): ScanResult[] {
  const threshold = options.threshold ?? DEFAULT_INK_THRESHOLD;
  const inkByTarget = new Map<string, number>();
  for (const reading of readings) {
    inkByTarget.set(reading.targetId, reading.ink);
  }

  const results: ScanResult[] = [];
  for (const page of manifest.pages) {
    for (const target of page.targets) {
      const ink = clampInk(inkByTarget.get(target.targetId));
      const result: ScanResult = {
        targetId: target.targetId,
        label: target.label,
        kind: target.kind,
        ink,
        selected: ink >= threshold,
        // 写库用带类别前缀的载荷；注册表没给（老数据/未知 bind）时退回裸 id。
        payload: target.applyPayload === undefined ? target.payload : target.applyPayload,
      };
      if (target.value !== undefined) result.value = target.value;
      results.push(result);
    }
  }
  return results;
}

function clampInk(ink: number | undefined): number {
  if (ink === undefined || !Number.isFinite(ink)) return 0;
  return Math.min(1, Math.max(0, ink));
}
