import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

/**
 * 番茄钟（P1-1.1~1.4）现在是功能插件。
 *
 * 它是**构建期插件**：随应用一起编译、可信任，因此仍直接使用 core/store。
 * 它是构建期插件（npm 包），所以可以直接 import core/store。
 */
export const pomodoroPlugin: PluginModule = {
  manifest: {
    id: 'gofor.pomodoro',
    name: '番茄钟',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '可自定义时长、全屏专注、分心记录与放弃确认。',
    author: 'GoFor',
    permissions: ['ui.screen'],
    provides: { screens: ['gofor.pomodoro/screen'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.pomodoro/screen',
      title: '番茄钟',
      group: '离线·M1',
      icon: '🍅',
      order: 10,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Pomodoro.tsx');
        return { default: module.Pomodoro };
      },
    });
  },
};
