import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const diaryPlugin: PluginModule = {
  manifest: {
    id: 'gofor.diary',
    name: '情绪日记',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '本地保存的短日记，可打标签与心情。',
    author: 'GoFor',
    permissions: ['ui.screen'],
    provides: { screens: ['gofor.diary/screen'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.diary/screen',
      title: '情绪日记',
      group: '在线·M3',
      icon: '📖',
      order: 20,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Diary.tsx');
        return { default: module.DiaryScreen };
      },
    });
  },
};
