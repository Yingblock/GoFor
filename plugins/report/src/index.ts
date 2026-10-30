import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

/**
 * 自我周报（P2-2.10）迁移成内置插件，并且是 3.9 的验收样本：
 * **它不 import `@gofor/store`**，全部数据走 `DataContract`。
 * 因此装上/卸载单词库插件时，"单词库"那一段会在「有数据 / 未安装」之间切换，
 * 而不是静默显示 0。
 */
export const reportPlugin: PluginModule = {
  manifest: {
    id: 'gofor.report',
    name: '自我周报',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '本周学习分钟、打卡率、三滑块、练习与单词库汇总。',
    author: 'GoFor',
    permissions: ['ui.screen', 'data.read'],
    provides: { screens: ['gofor.report/screen'] },
    consumes: {
      data: [
        { id: 'sessions.range', version: 1 },
        { id: 'subjects.all', version: 1 },
        { id: 'habits.range', version: 1 },
        { id: 'mood.range', version: 1 },
        { id: 'toolbox.recent', version: 1 },
        { id: 'diary.range', version: 1 },
        { id: 'wordbook.entries', version: 1, optional: true },
      ],
    },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.report/screen',
      title: '自我周报',
      group: '离线·M2',
      icon: '📊',
      order: 70,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Report.tsx');
        return { default: module.ReportScreen };
      },
    });
  },
};
