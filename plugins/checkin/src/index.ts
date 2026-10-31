import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';
import { CHECKIN_PRINT_TEMPLATES } from './printTemplates.ts';
import { pluginStore } from '@gofor/plugin-kit/store';

export const checkinPlugin: PluginModule = {
  manifest: {
    id: 'gofor.checkin',
    name: '每日打卡',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '周几重复 / 起止日期；未来不渲染、过去只读，只写今天。',
    author: 'GoFor',
    permissions: ['ui.screen', 'ui.home', 'print.template', 'scan.handle'],
    provides: {
      screens: ['gofor.checkin/screen'],
      printBlocks: ['habitRow', 'checkboxGrid'],
      scanPayloads: ['habit'],
    },
  },
  activate(context) {
    for (const template of CHECKIN_PRINT_TEMPLATES) {
      context.registerPrintTemplate(template);
    }

    context.registerScreen({
      id: 'gofor.checkin/screen',
      title: '每日打卡',
      group: '离线·M2',
      icon: '✅',
      order: 30,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Checkin.tsx');
        return { default: module.CheckinScreen };
      },
    });

    context.registerHomeBlock({
      id: 'gofor.checkin/home',
      title: '打卡提示',
      order: 30,
      load: async () => {
        const module = await import('./CheckinHomeBlock.tsx');
        return { default: module.CheckinHomeBlock };
      },
    });

    context.registerScanHandler({
      id: 'gofor.checkin/scan',
      async handle(results, scanContext) {
        const subset = results.filter(
          (result) => result.selected && (result.payload ?? '').startsWith('habit:'),
        );
        if (subset.length === 0) return { handled: 0, skipped: 0 };
        const summary = await pluginStore(context.store).applyHabitScan(
          subset,
          scanContext.date,
          scanContext.now(),
        );
        return { handled: summary.habitsChecked, skipped: summary.skipped };
      },
    });
  },
};
