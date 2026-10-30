import type { PluginManager } from './manager.js';
import type { PluginSnapshot, RunCommandResult } from './types.js';

/** IPC 频道名。渲染进程只能 invoke 这三个；没有任意代码执行通道。 */
export const PLUGIN_IPC_CHANNELS = {
  snapshot: 'gofor:plugins:snapshot',
  reload: 'gofor:plugins:reload',
  runCommand: 'gofor:plugins:run-command',
} as const;

/** Electron `ipcMain` 的最小结构类型，避免 runtime 包依赖 electron。 */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler?(channel: string): void;
}

export type PluginIpcDisposer = () => void;

/**
 * 把插槽/命令/状态以**只读快照**交给渲染进程。
 *
 * 不传函数、不传组件、不 eval：渲染进程拿到 `{ slotId, pluginId, renderer,
 * componentName }` 后，自己按 manifest 的 renderer 入口懒加载组件。
 */
export function registerPluginIpc(ipcMain: IpcMainLike, manager: PluginManager): PluginIpcDisposer {
  ipcMain.handle(PLUGIN_IPC_CHANNELS.snapshot, (): PluginSnapshot => manager.snapshot());
  ipcMain.handle(
    PLUGIN_IPC_CHANNELS.reload,
    (): Promise<PluginSnapshot> => manager.reloadPlugins(),
  );
  ipcMain.handle(
    PLUGIN_IPC_CHANNELS.runCommand,
    async (_event, rawId: unknown): Promise<RunCommandResult> => {
      if (typeof rawId !== 'string' || rawId.trim() === '') {
        return { ok: false, error: '命令 id 必须是非空字符串' };
      }
      return await manager.runCommand(rawId);
    },
  );

  return () => {
    ipcMain.removeHandler?.(PLUGIN_IPC_CHANNELS.snapshot);
    ipcMain.removeHandler?.(PLUGIN_IPC_CHANNELS.reload);
    ipcMain.removeHandler?.(PLUGIN_IPC_CHANNELS.runCommand);
  };
}
