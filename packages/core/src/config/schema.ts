import { z } from 'zod';
import { PAPER_IDS } from '../print/paper.ts';

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
  // 与 packages/core/src/print/paper.ts 共用同一份常量，避免两处枚举漂移
  paper: z.enum(PAPER_IDS),
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

/**
 * 备份提醒间隔的出厂默认值（天）。
 *
 * 这是现实世界会变的量（有人想每周备份、有人想每月），所以必须走配置，
 * 不能在备份代码里写死。这里同时作为 schema 缺省值：**旧版本配置里没有
 * `backup` 字段时，zod 用它补齐而不是让整份配置校验失败**——否则升级后
 * 用户的作息表、纸张、阈值会全部退回出厂默认。
 */
export const DEFAULT_BACKUP_REMINDER_DAYS = 7;

export const backupSchema = z.object({
  /** 距上次成功备份多少天后再次提醒。 */
  reminderDays: z.number().int().min(1).max(365).default(DEFAULT_BACKUP_REMINDER_DAYS),
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
  /** 备份提醒。旧配置没有这一节时由这里的 default 补出，见 backupSchema。 */
  backup: backupSchema.default({ reminderDays: DEFAULT_BACKUP_REMINDER_DAYS }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type Period = z.infer<typeof periodSchema>;
export type FocusUnit = z.infer<typeof focusUnitSchema>;
