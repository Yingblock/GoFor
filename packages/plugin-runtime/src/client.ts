import { PLUGIN_IPC_CHANNELS } from './ipc.js';
import type { PluginSnapshot, PluginViewSlotDescriptor, RunCommandResult } from './types.js';

/** Electron `ipcRenderer` 的最小结构类型。 */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

export interface PluginRendererClient {
  snapshot(): Promise<PluginSnapshot>;
  reload(): Promise<PluginSnapshot>;
  runCommand(id: string): Promise<RunCommandResult>;
}

/** 渲染进程唯一的插件入口：三个只读 invoke，没有 eval/动态代码字符串。 */
export function createPluginRendererClient(ipcRenderer: IpcRendererLike): PluginRendererClient {
  return {
    snapshot: async () =>
      (await ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.snapshot)) as PluginSnapshot,
    reload: async () => (await ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.reload)) as PluginSnapshot,
    runCommand: async (id: string) =>
      (await ipcRenderer.invoke(PLUGIN_IPC_CHANNELS.runCommand, id)) as RunCommandResult,
  };
}

/**
 * 插件渲染入口的 URL 约定：`gofor-plugin://<包名>/<renderer 相对路径>`。
 *
 * 主进程需要在 `protocol.handle('gofor-plugin', ...)` 里把包名映射到
 * `<userData>/plugins/node_modules/<包名>/`，并只允许读取该目录内的文件。
 * 渲染进程用 `import(url)` 拿组件，不经过 eval。
 */
export function pluginRendererUrl(packageName: string, rendererPath: string): string {
  const relative = rendererPath.replaceAll('\\', '/').replace(/^\.?\//, '');
  const segments = relative.split('/').map((segment) => encodeURIComponent(segment));
  return `gofor-plugin://${encodeURIComponent(packageName)}/${segments.join('/')}`;
}

/**
 * 按插槽描述懒加载组件。
 *
 * `importRenderer` 由宿主提供（通常是 `(url) => import(url)`，打包器需要 vite-ignore）；
 * 这里不写死 import，方便测试与打包器处理。
 */
export async function loadViewSlotComponent(
  slot: PluginViewSlotDescriptor,
  importRenderer: (url: string) => Promise<Record<string, unknown>>,
): Promise<unknown> {
  if (!slot.renderer) {
    throw new Error(
      `插件 ${slot.pluginId} 注册了插槽 ${slot.slotId}，但没有在 gofor.renderer 声明渲染入口`,
    );
  }
  const module = await importRenderer(pluginRendererUrl(slot.packageName, slot.renderer));
  const component = module[slot.componentName] ?? module.default;
  if (component === undefined) {
    throw new Error(
      `插件 ${slot.pluginId} 的渲染入口没有导出 ${slot.componentName}（也没有 default）`,
    );
  }
  return component;
}
