import {
  type AppConfig,
  CURRENT_CONFIG_VERSION,
  DEFAULT_APP_CONFIG,
  migrateConfig,
} from '@gofor/core/config';
import type { GoForDb } from './db.ts';

/** 配置行的固定主键。 */
export const DEFAULT_CONFIG_KEY = 'app';

export interface ResolvedConfig {
  config: AppConfig;
  warnings: string[];
}

function parseStored(value: string): { raw: unknown; parseFailed: boolean } {
  try {
    return { raw: JSON.parse(value), parseFailed: false };
  } catch {
    return { raw: null, parseFailed: true };
  }
}

/**
 * **只读**读取配置：绝不写库。
 *
 * 这是硬约束：Dexie 的 `liveQuery` 只允许只读事务，
 * 任何写操作都会抛 `ReadOnlyError` 并把整个组件树打挂。
 * 所以「修复并写回」只能走 `currentConfigOrDefault`，且只在启动时调用一次。
 */
export async function readConfig(database: GoForDb): Promise<AppConfig> {
  const row = await database.config.get(DEFAULT_CONFIG_KEY);
  if (!row) return structuredClone(DEFAULT_APP_CONFIG);

  const { raw } = parseStored(row.value);
  return migrateConfig(raw).config;
}

/**
 * 读取并**修复**配置：库里有就迁移并写回，没有就写入出厂默认。
 * 幂等，且只在启动时调用一次。
 */
export async function currentConfigOrDefault(database: GoForDb): Promise<ResolvedConfig> {
  const row = await database.config.get(DEFAULT_CONFIG_KEY);

  if (!row) {
    const config = structuredClone(DEFAULT_APP_CONFIG);
    await database.config.put({
      key: DEFAULT_CONFIG_KEY,
      value: JSON.stringify(config),
      updatedAt: Date.now(),
    });
    return { config, warnings: [] };
  }

  const { raw, parseFailed } = parseStored(row.value);
  const result = migrateConfig(raw);
  const warnings = [...result.warnings];

  if (parseFailed) warnings.push('配置内容损坏，已回退到出厂默认');
  if (result.fellBack) warnings.push('配置已重置为出厂默认');

  const fellBack = result.fellBack || parseFailed;

  // 迁移后版本与库里的不一致 → 写回，避免每次打开都重算
  const storedVersion =
    typeof raw === 'object' && raw !== null
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (fellBack || storedVersion !== CURRENT_CONFIG_VERSION) {
    await database.config.put({
      key: DEFAULT_CONFIG_KEY,
      value: JSON.stringify(result.config),
      updatedAt: Date.now(),
    });
  }

  return { config: result.config, warnings };
}
