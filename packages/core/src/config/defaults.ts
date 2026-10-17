import { type AppConfig, DEFAULT_BACKUP_REMINDER_DAYS } from './schema.ts';

/**
 * 作息表为空时的兜底课时长度。
 * 只在用户刚装好、还没导入课表时生效；导入后一律以作息表为准。
 */
export const FALLBACK_PERIOD_MINUTES = 45;

/**
 * 出厂默认配置。
 *
 * 设计原则：**默认值要能让用户第一次打开就可用**，不做设置向导。
 * 所有"现实世界会变"的量都在这里暴露，业务代码不允许内联魔法数字。
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 1,
  periods: [],
  focus: {
    unit: 'period',
    breakMinutes: 10,
    longBreakMinutes: 25,
    longBreakEvery: 4,
  },
  print: {
    // 默认 A4：校内外打印机基本都是 A4；完整混合版（清单 + 专注格 + 三段时间登记）
    // 实测需要约 201mm 高，A5 的 194mm 可用高度装不下。A5 留给精简版与口袋卡。
    paper: 'A4',
    focusGrid: {
      enabled: true,
      spareCells: 1,
    },
    hintLine: '深色笔 · 不出框 · 不连笔',
  },
  scan: {
    inkThreshold: 0.12,
    autoApply: false,
  },
  backup: {
    // 每周提醒一次：一个学期大约 20 周，7 天既能提醒到又不至于天天烦人。
    reminderDays: DEFAULT_BACKUP_REMINDER_DAYS,
  },
};
