import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';
import { TIMETABLE_PRINT_TEMPLATES } from './printTemplates.ts';

export const timetablePlugin: PluginModule = {
  manifest: {
    id: 'gofor.timetable',
    name: '课程表',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '学期 / 作息表 / 科目 / 排课规则；周视图与换课。',
    author: 'GoFor',
    permissions: ['ui.screen', 'ui.home', 'print.template'],
    provides: { screens: ['gofor.timetable/screen'], printBlocks: ['schedule'] },
  },
  activate(context) {
    context.registerHomeBlock({
      id: 'gofor.timetable/home',
      title: '今日课表',
      order: 20,
      span: 2,
      load: async () => {
        const module = await import('./TimetableHomeBlock.tsx');
        return { default: module.TimetableHomeBlock };
      },
    });

    for (const template of TIMETABLE_PRINT_TEMPLATES) {
      context.registerPrintTemplate(template);
    }

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
