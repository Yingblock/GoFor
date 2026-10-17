import { DEFAULT_APP_CONFIG } from './defaults.ts';
import { type AppConfig, appConfigSchema } from './schema.ts';

/** 当前配置结构版本。任何破坏性改版都要 +1 并补一条迁移。 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * 配置迁移。
 *
 * 为什么必须存在：用户可能把旧配置在手机上留一年，
 * **配置迁移失败 = App 直接打不开**，比数据迁移失败更致命。
 *
 * 约定：
 * - 每个迁移函数只负责把 `vN` 升到 `vN+1`，互不依赖顺序以外的假设
 * - 迁移完必须过 schema 校验，不允许"迁出来但字段是错的"
 * - 任何一步失败都回退到出厂默认，**宁可丢设置也不能白屏**
 */
const MIGRATIONS: Record<number, (input: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2 的迁移将来加在这里，例如：
  // 1: (cfg) => ({ ...cfg, schemaVersion: 2, newField: defaultValue }),
};

export interface MigrateConfigResult {
  config: AppConfig;
  /** 迁移过程中产生的告警，用于调试面板展示。 */
  warnings: string[];
  /** 是否回退到了出厂默认。 */
  fellBack: boolean;
}

export function migrateConfig(raw: unknown): MigrateConfigResult {
  const warnings: string[] = [];

  if (raw === null || raw === undefined) {
    return { config: structuredClone(DEFAULT_APP_CONFIG), warnings, fellBack: false };
  }
  if (typeof raw !== 'object') {
    return {
      config: structuredClone(DEFAULT_APP_CONFIG),
      warnings: ['配置不是对象，已回退到出厂默认'],
      fellBack: true,
    };
  }

  let working = { ...(raw as Record<string, unknown>) };
  let version = typeof working.schemaVersion === 'number' ? working.schemaVersion : 1;

  if (version > CURRENT_CONFIG_VERSION) {
    warnings.push(
      `配置版本 ${version} 高于当前支持的 ${CURRENT_CONFIG_VERSION}，按当前版本尝试读取`,
    );
    version = CURRENT_CONFIG_VERSION;
  }

  while (version < CURRENT_CONFIG_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      warnings.push(`缺少 v${version} → v${version + 1} 的迁移，已回退到出厂默认`);
      return { config: structuredClone(DEFAULT_APP_CONFIG), warnings, fellBack: true };
    }
    working = migrate(working);
    version += 1;
  }

  working.schemaVersion = CURRENT_CONFIG_VERSION;

  const parsed = appConfigSchema.safeParse(working);
  if (!parsed.success) {
    warnings.push(`配置校验失败，已回退到出厂默认：${parsed.error.issues[0]?.message ?? '未知'}`);
    return { config: structuredClone(DEFAULT_APP_CONFIG), warnings, fellBack: true };
  }

  return { config: parsed.data, warnings, fellBack: false };
}
