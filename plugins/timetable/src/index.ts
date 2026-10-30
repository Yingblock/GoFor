import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const timetablePlugin: PluginModule = {
  manifest: {
    id: 'gofor.timetable',
    name: '课程表',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '学期 / 作息表 / 科目 / 排课规则；周视图与换课。',
    author: 'GoFor',
    permissions: ['ui.screen'],
    provides: { screens: ['gofor.timetable/screen'], printBlocks: ['schedule'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.timetable/screen',
      title: '课程表',
      group: '离线·M2',
      icon: '🗓️',
      order: 20,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Timetable.tsx');
        return { default: module.TimetableScreen };
      },
    });
  },
};
