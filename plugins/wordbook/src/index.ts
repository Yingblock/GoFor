import { PLUGIN_API_VERSION, type PluginModule, type WordbookQuery } from '@gofor/plugin-api';
import { filterWordbookEntries } from './wordbook.ts';
import { readWordbookEntries } from './wordbookStore.ts';

/**
 * 单词库插件 v1（P3-3.7 / P4-4.16）。
 *
 * 这是"内容模块插件"的参考实现：
 * - 数据只写自己的 `pluginData`（`entries` 集合），备份由切片自动带上；
 * - 对外只暴露 `wordbook.entries` 数据契约与 `search()`，不要求别人知道数据形状；
 * - 不做复习（SRS 在 P4-4.8）。
 */
export const wordbookPlugin: PluginModule = {
  manifest: {
    id: 'gofor.wordbook',
    name: '单词库',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '导入 CSV/TSV 词表，按词或标签查找。不属于复习功能。',
    author: 'GoFor',
    permissions: ['ui.screen', 'ui.slot', 'data.provide', 'storage'],
    provides: {
      screens: ['gofor.wordbook/screen'],
      data: [{ id: 'wordbook.entries', version: 1, summary: '单词库全部词条（可按词/标签过滤）' }],
      content: ['wordbook'],
    },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.wordbook/screen',
      title: '单词库',
      group: '离线·M1',
      icon: '📚',
      order: 30,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Wordbook.tsx');
        return { default: module.WordbookScreen };
      },
    });

    // 首页统计区后面加一张小卡：插件被禁用时这块自然消失。
    context.registerSlot({
      id: 'gofor.wordbook/home-card',
      slot: 'home.after-stats',
      order: 10,
      load: async () => {
        const module = await import('./HomeSlot.tsx');
        return { default: module.WordbookHomeSlot };
      },
    });

    context.registerData({
      id: 'wordbook.entries',
      version: 1,
      summary: '单词库全部词条（可按词/标签过滤）',
      async query(input) {
        const entries = await readWordbookEntries(context.storage);
        const query = isQuery(input) ? input : {};
        return filterWordbookEntries(entries, query);
      },
      async revision() {
        const entries = await readWordbookEntries(context.storage);
        return entries.length * 1_000_000_007 + entries.reduce((sum, e) => sum + e.updatedAt, 0);
      },
    });

    context.registerContentModule({
      id: 'gofor.wordbook/module',
      kind: 'wordbook',
      name: '单词库',
      screenId: 'gofor.wordbook/screen',
      collections: ['entries'],
      async search(query) {
        const entries = await readWordbookEntries(context.storage);
        return filterWordbookEntries(entries, { query })
          .slice(0, 20)
          .map((entry) => ({
            moduleId: 'gofor.wordbook/module',
            title: entry.term,
            snippet: entry.meaning,
            screenId: 'gofor.wordbook/screen',
          }));
      },
    });
  },
};

function isQuery(input: unknown): input is WordbookQuery {
  return typeof input === 'object' && input !== null;
}
