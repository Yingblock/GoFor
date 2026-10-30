import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

/**
 * 环境清单（P2-2.6）迁移成内置插件。
 *
 * P3-3.3 只迁"行为屏"：数据表仍在 core/store，页面通过宿主注册表进入。
 * 番茄钟 / 课表 / 打印 / 扫描保留内核实现，但同样出现在这张注册表里。
 */
export const checklistPlugin: PluginModule = {
  manifest: {
    id: 'gofor.checklist',
    name: '环境清单',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '开始学习前的一键流程清单，每天勾一次。',
    author: 'GoFor',
    permissions: ['ui.screen'],
    provides: { screens: ['gofor.checklist/screen'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.checklist/screen',
      title: '环境清单',
      group: '离线·M1',
      icon: '🧹',
      order: 20,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Checklist.tsx');
        return { default: module.ChecklistScreen };
      },
    });
  },
};
