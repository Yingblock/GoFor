import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';
import { applyScanResults, db } from '@gofor/store';

export const moodPlugin: PluginModule = {
  manifest: {
    id: 'gofor.mood',
    name: '三格自评',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '睡眠 / 心情 / 专注三个 1–5 分，纸上也能勾。',
    author: 'GoFor',
    permissions: ['ui.screen', 'scan.handle'],
    provides: { screens: ['gofor.mood/screen'], printBlocks: ['ratingGrid'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.mood/screen',
      title: '三格自评',
      group: '离线·M2',
      icon: '🌡️',
      order: 60,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Mood.tsx');
        return { default: module.MoodScreen };
      },
    });

    context.registerScanHandler({
      id: 'gofor.mood/scan',
      async handle(results, scanContext) {
        const subset = results.filter(
          (result) => result.selected && (result.payload ?? '').startsWith('mood:'),
        );
        if (subset.length === 0) return { handled: 0, skipped: 0 };
        const summary = await applyScanResults(db, subset, scanContext.date, scanContext.now());
        return { handled: summary.moodSaved ? 1 : 0, skipped: summary.skipped };
      },
    });
  },
};
