const HISTOGRAM_BINS = 256;

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > HISTOGRAM_BINS - 1) return HISTOGRAM_BINS - 1;
  return rounded;
}

/**
 * Otsu 自动阈值（0–255）。
 *
 * 做法：把灰度四舍五入进 256 个 bin 的直方图，枚举所有分割点 t，
 * 取「类间方差 wB·wF·(meanB-meanF)²」最大的那个；
 * 最终阈值取两侧类均值的**中点**（而不是 bin 下标），
 * 这样「白纸 + 黑块」这类双峰图会落在黑与白之间，而不是贴着黑。
 *
 * 全同灰度图（例如全白）没有可分性，直接返回该灰度值（全白 → 255），不抛错。
 */
export function otsuThreshold(gray: Float32Array): number {
  if (gray.length === 0) return 0;

  const histogram = new Uint32Array(HISTOGRAM_BINS);
  let total = 0;
  let min = HISTOGRAM_BINS - 1;
  let max = 0;

  for (let i = 0; i < gray.length; i += 1) {
    const bin = clampByte(gray[i] ?? 0);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
    total += 1;
    if (bin < min) min = bin;
    if (bin > max) max = bin;
  }

  if (total === 0) return 0;
  if (min === max) return min;

  let sum = 0;
  for (let bin = min; bin <= max; bin += 1) {
    sum += bin * (histogram[bin] ?? 0);
  }

  let weightLow = 0;
  let sumLow = 0;
  let bestVariance = -1;
  let bestMeanLow = min;
  let bestMeanHigh = max;

  for (let split = min; split < max; split += 1) {
    const count = histogram[split] ?? 0;
    weightLow += count;
    if (weightLow === 0) continue;

    sumLow += split * count;
    const weightHigh = total - weightLow;
    if (weightHigh === 0) break;

    const meanLow = sumLow / weightLow;
    const meanHigh = (sum - sumLow) / weightHigh;
    const variance = weightLow * weightHigh * (meanLow - meanHigh) * (meanLow - meanHigh);

    if (variance > bestVariance) {
      bestVariance = variance;
      bestMeanLow = meanLow;
      bestMeanHigh = meanHigh;
    }
  }

  // 用最优分割点两侧的类均值中点作为阈值（比 bin 下标更贴合真实边界）。
  return clampByte((bestMeanLow + bestMeanHigh) / 2);
}
