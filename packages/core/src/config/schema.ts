import { z } from 'zod';

/** "HH:mm"，24 小时制，两位补齐。 */
export const PERIOD_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const periodSchema = z
  .object({
    index: z.number().int().positive(),
    start: z.string().regex(PERIOD_TIME_PATTERN, '格式应为 HH:mm'),
    end: z.string().regex(PERIOD_TIME_PATTERN, '格式应为 HH:mm'),
  })
  .refine((period) => period.end > period.start, {
    message: '结束时间必须晚于开始时间',
  });

/**
 * 一个「专注格」代表多少分钟。
 * - `'period'`：跟随作息表推导（默认，适用于在校日）
 * - 数字：固定分钟数，例如在家用 25 分钟番茄钟
 */
export const focusUnitSchema = z.union([z.literal('period'), z.number().int().min(1).max(240)]);

export const printSchema = z.object({
  paper: z.enum(['A4', 'A5', 'B5', 'index-card']),
  focusGrid: z.object({
    enabled: z.boolean(),
    /** 每行在「当天该科目节数」之外多留几格，给加练/自习用。 */
    spareCells: z.number().int().min(0).max(10),
  }),
  /** 印在纸上的书写提示；置空则不打印。 */
  hintLine: z.string(),
});

export const scanSchema = z.object({
  /** 局部墨迹占比超过这个值即视为「已涂满」。 */
  inkThreshold: z.number().min(0).max(1),
  /** 识别结果是否直接应用；false 时进入待确认列表。 */
  autoApply: z.boolean(),
});

export const appConfigSchema = z.object({
  schemaVersion: z.number().int().positive(),
  /** 作息表。所有「课时长度」都从这里推导，不在代码里写死。 */
  periods: z.array(periodSchema),
  focus: z.object({
    unit: focusUnitSchema,
    breakMinutes: z.number().int().min(1).max(120),
    longBreakMinutes: z.number().int().min(1).max(180),
    longBreakEvery: z.number().int().min(2).max(12),
  }),
  print: printSchema,
  scan: scanSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type Period = z.infer<typeof periodSchema>;
export type FocusUnit = z.infer<typeof focusUnitSchema>;
