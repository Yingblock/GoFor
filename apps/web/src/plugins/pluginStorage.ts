import type { PluginStorage } from '@gofor/plugin-api';
import type { GoForDb } from '@gofor/store';
import {
  clearPluginValues,
  deletePluginValue,
  listPluginValues,
  readPluginValue,
  writePluginValue,
} from '@gofor/store';

/**
 * 把 `pluginData` 通用容器包装成插件能用的键值存储。
 *
 * 每次调用都绑定一个 pluginId：插件**拿不到**别的插件的命名空间，
 * 这是 P3-3.9「禁止插件互读 pluginData」在类型与实现两层的落点。
 */
export function createPluginStorage(
  database: GoForDb,
  pluginId: string,
  now: () => number,
): PluginStorage {
  return {
    get: <T>(collection: string, key: string) =>
      readPluginValue<T>(database, pluginId, collection, key),
    put: (collection: string, key: string, value: unknown) =>
      writePluginValue(database, pluginId, collection, key, value, now()),
    list: <T>(collection: string) => listPluginValues<T>(database, pluginId, collection),
    delete: (collection: string, key: string) =>
      deletePluginValue(database, pluginId, collection, key),
    clear: async () => {
      await clearPluginValues(database, pluginId);
    },
  };
}
