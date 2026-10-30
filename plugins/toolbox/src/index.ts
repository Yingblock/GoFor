import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const toolboxPlugin: PluginModule = {
  manifest: {
    id: 'gofor.toolbox',
    name: '自助工具箱',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '4-7-8 呼吸、渐进放松、5-4-3-2-1、身体扫描。',
    author: 'GoFor',
    permissions: ['ui.screen'],
    provides: { screens: ['gofor.toolbox/screen'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.toolbox/screen',
      title: '自助工具箱',
      group: '在线·M3',
      icon: '🧠',
      order: 10,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Toolbox.tsx');
        return { default: module.ToolboxScreen };
      },
    });
  },
};
