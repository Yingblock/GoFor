import { FALLBACK_PERIOD_MINUTES } from './defaults.ts';
import { type AppConfig, appConfigSchema } from './schema.ts';
import { derivePeriodMinutes } from './time.ts';

/**
 * 一个「专注格」代表多少分钟。
 *
 * `focus.unit === 'period'` 时跟随作息表推导——这是"课时随课表导入"的落点：
 * 学校一节课 40 还是 45 分钟，由导入的作息表决定，不在代码里写死。
 */
export function resolveUnitMinutes(config: AppConfig): number {
  const { unit } = config.focus;
  if (typeof unit === 'number') return unit;
  return derivePeriodMinutes(config.periods) ?? FALLBACK_PERIOD_MINUTES;
}

/** 涂满 `cells` 格等于多少分钟。 */
export function minutesForCells(config: AppConfig, cells: number): number {
  return Math.max(0, cells) * resolveUnitMinutes(config);
}

/**
 * 多少分钟换算成多少格（向上取整）。
 * 模板排版时用它决定一行画几个格子。
 */
export function cellsForMinutes(config: AppConfig, minutes: number): number {
  const unit = resolveUnitMinutes(config);
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / unit);
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const baseValue = base[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? mergeObjects(baseValue, patchValue)
        : patchValue;
  }
  return result;
}

/**
 * 深合并配置并校验。
 *
 * 校验放在最后一步是有意的：**任何来源（用户改设置、导入文件、AI 生成）
 * 的配置都必须过 schema**，不能因为"我们自己写的默认值"就跳过。
 */
export function mergeConfig(base: AppConfig, patch: DeepPartial<AppConfig>): AppConfig {
  const merged = mergeObjects(
    base as unknown as Record<string, unknown>,
    patch as unknown as Record<string, unknown>,
  );
  return appConfigSchema.parse(merged);
}

/** 校验任意输入是否为合法配置（用于导入 JSON）。 */
export function parseConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}
