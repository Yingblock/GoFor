import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';
import { applyScanResults, db } from '@gofor/store';

export const tasksPlugin: PluginModule = {
  manifest: {
    id: 'gofor.tasks',
    name: '作业清单',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '截止、必做/选做、步骤、标签池与上下移动。',
    author: 'GoFor',
    permissions: ['ui.screen', 'scan.handle'],
    provides: { screens: ['gofor.tasks/screen'], printBlocks: ['checkboxList'] },
  },
  activate(context) {
    context.registerScreen({
      id: 'gofor.tasks/screen',
      title: '作业清单',
      group: '离线·M2',
      icon: '📋',
      order: 10,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./Tasks.tsx');
        return { default: module.Tasks };
      },
    });

    context.registerScanHandler({
      id: 'gofor.tasks/scan',
      async handle(results, scanContext) {
        const subset = results.filter(
          (result) => result.selected && (result.payload ?? '').startsWith('task:'),
        );
        if (subset.length === 0) return { handled: 0, skipped: 0 };
        const summary = await applyScanResults(db, subset, scanContext.date, scanContext.now());
        return { handled: summary.tasksDone, skipped: summary.skipped };
      },
    });
  },
};
