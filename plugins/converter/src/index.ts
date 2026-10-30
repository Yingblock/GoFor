import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

/**
 * 转换器契约的示例实现（P3-3.8）。
 *
 * `worker` 指向宿主内置 Worker 里的任务 id：真正的转换在 Worker 里跑，
 * 死循环/超大输入只会把任务判超时，不会冻结页面。
 * 需要本机 Office/LibreOffice 的转换（P5-5.12）没有 worker 路径，
 * 在 PWA 下显示"网页版不能转换"。
 */
export const textConverterPlugin: PluginModule = {
  manifest: {
    id: 'gofor.convert',
    name: '纯文本转换',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '把 Markdown 转成纯文本，在 Worker 里执行。',
    author: 'GoFor',
    permissions: ['converter'],
    provides: { converters: ['gofor.convert/markdown-text'] },
  },
  activate(context) {
    context.registerConverter({
      id: 'gofor.convert/markdown-text',
      title: 'Markdown → 纯文本',
      from: ['text/markdown', 'text/plain'],
      to: 'text/plain',
      worker: 'markdown-to-text',
    });
  },
};
