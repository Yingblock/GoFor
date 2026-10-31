import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const scanPlugin: PluginModule = {
  manifest: {
    id: 'gofor.scan',
    name: '扫描回填',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '拍照 → 自动找四角 → 矫正 → 解二维码/条码 → 逐条确认后写库。',
    author: 'GoFor',
    permissions: ['ui.screen', 'ui.home'],
    provides: { screens: ['gofor.scan/screen'] },
  },
  activate(context) {
    context.registerHomeBlock({
      id: 'gofor.scan/home',
      title: '纸面闭环',
      order: 10,
      span: 2,
      load: async () => {
        const module = await import('./ScanHomeBlock.tsx');
        return { default: module.ScanHomeBlock };
      },
    });

    context.registerScreen({
      id: 'gofor.scan/screen',
      title: '扫描回填',
      group: '离线·M2',
      icon: '📸',
      order: 50,
      layout: 'content',
      chrome: 'default',
      load: async () => {
        const module = await import('./ScanPluginScreen.tsx');
        return { default: module.ScanPluginScreen };
      },
    });
  },
};
