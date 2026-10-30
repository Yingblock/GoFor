/**
 * 周视图的"格子"计算（纯函数）。
 *
 * 原来这段在组件里用 `useMemo` 算，搬出来是为了能测：
 * "连堂块占了哪几格"、"被跨行遮住的格子还能不能点"是排课正确性的一部分，
 * 而在界面上验证它需要真的点开浏览器。
 */

import { mergeAdjacent, occurrencesOn } from './occurrences.ts';
import type { Occurrence, TimetableData } from './types.ts';

/** 一格的身份：`日期#第几节`。编辑模式用它判断"这格已经有课了"。 */
export function cellKeyOf(date: string, periodIndex: number): string {
  return `${date}#${periodIndex}`;
}

/**
 * 一周的课：日期 → 当天的课（已合并连堂）。
 *
 * 先合并再渲染：数学排成第 2、3 节两条规则时，屏幕上应该是一整块连堂，
 * 而不是两个方块。"什么算连堂"是课表语义，由 core 的 `mergeAdjacent` 定义。
 */
export function buildWeekGrid(
  weekDates: readonly string[],
  data: TimetableData,
): Map<string, Occurrence[]> {
  return new Map(weekDates.map((date) => [date, mergeAdjacent(occurrencesOn(date, data))]));
}

/**
 * 编辑模式下已经"有课"的格子。
 *
 * 用**合并后**的结果算：一个连堂块占 span 行，这几行都算有课；
 * 否则连堂块下面的格子还能点开"加课"，排出时间重叠的规则。
 */
export function occupiedCellKeys(byDay: ReadonlyMap<string, readonly Occurrence[]>): Set<string> {
  const cells = new Set<string>();
  for (const [date, occurrences] of byDay) {
    for (const occurrence of occurrences) {
      for (let offset = 0; offset < occurrence.span; offset += 1) {
        cells.add(cellKeyOf(date, occurrence.startPeriod + offset));
      }
    }
  }
  return cells;
}
