import type { GoForDb } from './db.ts';

/**
 * 插件注册记录与插件数据（P3-3.5 / P3-3.12）。
 *
 * 两条硬约定：
 * 1. **启用状态只存在这里**，不存进配置。安装页要读它，而禁用插件时
 *    不能先依赖"配置读取成功"；配置里只放 `plugins.<id>.settings`。
 * 2. **插件数据只走 `pluginData` 一张容器表**。插件自己的 schema 怎么演化
 *    都不牵动 Dexie 版本（版本号发布即冻结，见 AGENTS.md 存储约定）。
 */

export type PluginKind = 'builtin' | 'installed';

export interface PluginRecord {
  id: string;
  kind: PluginKind;
  enabled: boolean;
  /** 校验后的 manifest（JSON 字符串）。存字符串而不是对象，保证导出/导入是纯 JSON。 */
  manifestJson: string;
  /** 历史字段：旧的运行时单文件 JS 源码；现在不读取，内置插件是空串。 */
  source: string;
  installedAt: number;
  updatedAt: number;
}

export interface PluginDataRow {
  /** `${pluginId}/${collection}/${key}`，全局唯一。 */
  id: string;
  pluginId: string;
  collection: string;
  key: string;
  /** JSON 字符串；插件数据不参与索引，只做整块存取。 */
  value: string;
  updatedAt: number;
}

export function pluginDataId(pluginId: string, collection: string, key: string): string {
  return `${pluginId}/${collection}/${key}`;
}

const COLLECTION_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const KEY_PATTERN = /^[A-Za-z0-9._:@-]+$/;

/** 集合与键都限制成安全字符：它们会拼进主键，不能带 `/` 把命名空间搅乱。 */
export function assertPluginKey(collection: string, key: string): void {
  if (!COLLECTION_PATTERN.test(collection)) {
    throw new Error(`插件集合名非法：${collection}（只能用小写字母/数字/_-）`);
  }
  if (!KEY_PATTERN.test(key)) {
    throw new Error(`插件数据键非法：${key}（不能含斜杠或空格）`);
  }
}

/* ------------------------------------------------------------ 注册记录 */

export async function listPluginRecords(database: GoForDb): Promise<PluginRecord[]> {
  const rows = await database.plugins.toArray();
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getPluginRecord(
  database: GoForDb,
  id: string,
): Promise<PluginRecord | undefined> {
  return database.plugins.get(id);
}

/**
 * 播种内置插件。
 *
 * 只补缺、只更新 manifest 与 kind；**不覆盖用户选择的启用状态**，
 * 否则每次启动都会把用户禁用的插件又打开。
 */
export async function ensureBuiltinPlugins(
  database: GoForDb,
  builtins: ReadonlyArray<{ id: string; manifestJson: string; enabledByDefault?: boolean }>,
  now: number,
): Promise<void> {
  for (const builtin of builtins) {
    const existing = await database.plugins.get(builtin.id);
    if (!existing) {
      await database.plugins.put({
        id: builtin.id,
        kind: 'builtin',
        // 内置插件也可以默认关闭（例如主题包：没选就不该改整站外观）。
        enabled: builtin.enabledByDefault ?? true,
        manifestJson: builtin.manifestJson,
        source: '',
        installedAt: now,
        updatedAt: now,
      });
      continue;
    }
    if (existing.manifestJson !== builtin.manifestJson || existing.kind !== 'builtin') {
      await database.plugins.put({
        ...existing,
        kind: 'builtin',
        manifestJson: builtin.manifestJson,
        updatedAt: now,
      });
    }
  }
}

/** 历史 API：运行时单文件加载已删除；保留用于旧数据/备份测试，不再被 UI 调用。 */
export async function saveInstalledPlugin(
  database: GoForDb,
  input: { id: string; manifestJson: string; source: string },
  now: number,
): Promise<void> {
  const existing = await database.plugins.get(input.id);
  await database.plugins.put({
    id: input.id,
    kind: 'installed',
    enabled: existing?.enabled ?? true,
    manifestJson: input.manifestJson,
    source: input.source,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  });
}

export async function setPluginEnabled(
  database: GoForDb,
  id: string,
  enabled: boolean,
  now: number,
): Promise<void> {
  await database.plugins.update(id, { enabled, updatedAt: now });
}

/**
 * 历史 API：现在没有卸载 UI；保留用于验证"删记录不删数据"的语义。
 * 默认**保留**插件数据，只有显式 `deleteData: true` 才清。
 */
export async function deletePluginRecord(
  database: GoForDb,
  id: string,
  options: { deleteData?: boolean } = {},
): Promise<void> {
  await database.plugins.delete(id);
  if (options.deleteData === true) {
    await clearPluginValues(database, id);
  }
}

/* -------------------------------------------------------------- 插件数据 */

export async function readPluginValue<T = unknown>(
  database: GoForDb,
  pluginId: string,
  collection: string,
  key: string,
): Promise<T | null> {
  assertPluginKey(collection, key);
  const row = await database.pluginData.get(pluginDataId(pluginId, collection, key));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // 坏数据当不存在，而不是让整个页面崩在 JSON.parse 上。
    return null;
  }
}

export async function writePluginValue(
  database: GoForDb,
  pluginId: string,
  collection: string,
  key: string,
  value: unknown,
  now: number,
): Promise<void> {
  assertPluginKey(collection, key);
  await database.pluginData.put({
    id: pluginDataId(pluginId, collection, key),
    pluginId,
    collection,
    key,
    value: JSON.stringify(value) ?? 'null',
    updatedAt: now,
  });
}

export async function listPluginValues<T = unknown>(
  database: GoForDb,
  pluginId: string,
  collection: string,
): Promise<Array<{ key: string; value: T }>> {
  if (!COLLECTION_PATTERN.test(collection)) {
    throw new Error(`插件集合名非法：${collection}`);
  }
  const rows = await database.pluginData
    .where('[pluginId+collection]')
    .equals([pluginId, collection])
    .toArray();
  const result: Array<{ key: string; value: T }> = [];
  for (const row of rows) {
    try {
      result.push({ key: row.key, value: JSON.parse(row.value) as T });
    } catch {
      // 同上：坏行跳过，不整批失败。
    }
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

export async function deletePluginValue(
  database: GoForDb,
  pluginId: string,
  collection: string,
  key: string,
): Promise<void> {
  assertPluginKey(collection, key);
  await database.pluginData.delete(pluginDataId(pluginId, collection, key));
}

/** 清空一个插件的全部数据（卸载并可选择删除时使用）。 */
export async function clearPluginValues(database: GoForDb, pluginId: string): Promise<number> {
  return database.pluginData.where('pluginId').equals(pluginId).delete();
}

/** 备份/统计用：某个插件的全部数据行。 */
export async function listPluginDataRows(
  database: GoForDb,
  pluginId?: string,
): Promise<PluginDataRow[]> {
  if (pluginId === undefined) return database.pluginData.toArray();
  return database.pluginData.where('pluginId').equals(pluginId).toArray();
}
