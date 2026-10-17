import { describe, expect, it } from 'vitest';
import {
  cellsForMinutes,
  DEFAULT_APP_CONFIG,
  derivePeriodMinutes,
  FALLBACK_PERIOD_MINUTES,
  mergeConfig,
  migrateConfig,
  minutesForCells,
  parseClockTime,
  parseConfig,
  periodMinutes,
  resolveUnitMinutes,
} from './index.js';

/** 典型高中作息：早读 30 分钟 + 五节 40 分钟课。 */
const SCHOOL_PERIODS = [
  { index: 1, start: '07:30', end: '08:00' }, // 早读
  { index: 2, start: '08:10', end: '08:50' },
  { index: 3, start: '09:00', end: '09:40' },
  { index: 4, start: '10:00', end: '10:40' },
  { index: 5, start: '14:00', end: '14:40' },
  { index: 6, start: '14:50', end: '15:30' },
];

describe('配置：时间解析', () => {
  it('把 HH:mm 解析为当日分钟数', () => {
    expect(parseClockTime('00:00')).toBe(0);
    expect(parseClockTime('08:50')).toBe(530);
    expect(parseClockTime('23:59')).toBe(1439);
  });

  it('计算单节课时长', () => {
    expect(periodMinutes({ start: '08:10', end: '08:50' })).toBe(40);
  });
});

describe('配置：课时长度从作息表推导', () => {
  it('作息表为空时返回 undefined', () => {
    expect(derivePeriodMinutes([])).toBeUndefined();
  });

  it('中位数不被早读这类异常段拉偏', () => {
    // 平均会得到 ~37，中位数是 40
    expect(derivePeriodMinutes(SCHOOL_PERIODS)).toBe(40);
  });

  it('单节课时也成立', () => {
    expect(derivePeriodMinutes([{ start: '08:00', end: '08:45' }])).toBe(45);
  });

  it('中位数结果圆整到 5 分钟', () => {
    expect(
      derivePeriodMinutes([
        { start: '08:00', end: '08:42' },
        { start: '09:00', end: '09:42' },
      ]),
    ).toBe(40);
  });
});

describe('配置：专注格单位', () => {
  it('未导入课表时回退到兜底值', () => {
    expect(resolveUnitMinutes(DEFAULT_APP_CONFIG)).toBe(FALLBACK_PERIOD_MINUTES);
  });

  it('导入课表后跟随课时长度', () => {
    const config = mergeConfig(DEFAULT_APP_CONFIG, { periods: SCHOOL_PERIODS });
    expect(resolveUnitMinutes(config)).toBe(40);
  });

  it('显式指定分钟数时覆盖推导', () => {
    const config = mergeConfig(DEFAULT_APP_CONFIG, { focus: { unit: 25 } });
    expect(resolveUnitMinutes(config)).toBe(25);
  });

  it('格数与分钟可以双向换算', () => {
    const config = mergeConfig(DEFAULT_APP_CONFIG, { focus: { unit: 45 } });
    expect(minutesForCells(config, 3)).toBe(135);
    expect(cellsForMinutes(config, 135)).toBe(3);
    // 不足一格算一格（排版时不能少画）
    expect(cellsForMinutes(config, 46)).toBe(2);
    expect(cellsForMinutes(config, 0)).toBe(0);
  });
});

describe('配置：合并与校验', () => {
  it('深合并不会改动原对象', () => {
    const merged = mergeConfig(DEFAULT_APP_CONFIG, {
      print: { paper: 'A5' },
      focus: { unit: 25 },
    });

    expect(merged.print.paper).toBe('A5');
    expect(merged.print.focusGrid.spareCells).toBe(1); // 未覆盖的兄弟字段保留
    expect(merged.focus.unit).toBe(25);
    expect(merged.focus.breakMinutes).toBe(10);

    expect(DEFAULT_APP_CONFIG.print.paper).toBe('A4');
    expect(DEFAULT_APP_CONFIG.focus.unit).toBe('period');
  });

  it('数组被整体替换而不是合并', () => {
    const merged = mergeConfig(DEFAULT_APP_CONFIG, { periods: SCHOOL_PERIODS });
    expect(merged.periods).toHaveLength(SCHOOL_PERIODS.length);
  });

  it('默认配置本身是合法的', () => {
    expect(() => parseConfig(DEFAULT_APP_CONFIG)).not.toThrow();
  });

  it('非法纸张被拒', () => {
    expect(() => mergeConfig(DEFAULT_APP_CONFIG, { print: { paper: 'A3' as never } })).toThrow();
  });

  it('墨迹阈值超出 0–1 被拒', () => {
    expect(() => mergeConfig(DEFAULT_APP_CONFIG, { scan: { inkThreshold: 1.5 } })).toThrow();
  });

  it('结束时间早于开始时间被拒', () => {
    expect(() =>
      mergeConfig(DEFAULT_APP_CONFIG, {
        periods: [{ index: 1, start: '09:00', end: '08:00' }],
      }),
    ).toThrow();
  });

  it('时间格式不合规被拒', () => {
    expect(() =>
      mergeConfig(DEFAULT_APP_CONFIG, {
        periods: [{ index: 1, start: '8:00', end: '08:45' }],
      }),
    ).toThrow();
  });
});

describe('配置：备份提醒', () => {
  it('默认每 7 天提醒备份', () => {
    expect(DEFAULT_APP_CONFIG.backup.reminderDays).toBe(7);
  });

  it('深合并可单独改提醒间隔', () => {
    const merged = mergeConfig(DEFAULT_APP_CONFIG, { backup: { reminderDays: 14 } });
    expect(merged.backup.reminderDays).toBe(14);
    // 同级的其它配置必须原样保留（深合并而不是整份替换）
    expect(merged.print.paper).toBe(DEFAULT_APP_CONFIG.print.paper);
    expect(merged.scan.inkThreshold).toBe(DEFAULT_APP_CONFIG.scan.inkThreshold);
  });

  it('旧配置缺少 backup 时补默认值，而不是整份回退', () => {
    // 模拟「用户几个月前存的配置」：schemaVersion 还是 1，但没有 backup 这一节，
    // 而且用户改过纸张（用来证明迁移没有把整份配置重置成出厂默认）。
    const oldConfig = JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)) as Record<string, unknown>;
    delete oldConfig.backup;
    oldConfig.print = { ...(oldConfig.print as Record<string, unknown>), paper: 'A5' };

    const result = migrateConfig(oldConfig);
    expect(result.fellBack).toBe(false);
    expect(result.config.backup.reminderDays).toBe(7);
    expect(result.config.print.paper).toBe('A5');
  });

  it('backup 内部缺字段时也补默认值', () => {
    const parsed = parseConfig({
      ...DEFAULT_APP_CONFIG,
      backup: {},
    });
    expect(parsed.backup.reminderDays).toBe(7);
  });

  it('提醒间隔超出合理范围被拒', () => {
    expect(() => mergeConfig(DEFAULT_APP_CONFIG, { backup: { reminderDays: 0 } })).toThrow();
    expect(() => mergeConfig(DEFAULT_APP_CONFIG, { backup: { reminderDays: 366 } })).toThrow();
  });
});
