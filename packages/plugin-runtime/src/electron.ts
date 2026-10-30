import { type IpcMainLike, registerPluginIpc } from './ipc.js';
import { PluginManager, type PluginManagerOptions } from './manager.js';
import type { TaskStore } from './types.js';

/** Electron `app` 的最小结构类型。 */
export interface ElectronAppLike {
  getPath(name: 'userData'): string;
}

export interface ElectronPluginRuntimeOptions {
  app: ElectronAppLike;
  ipcMain: IpcMainLike;
  taskStore: TaskStore;
  logger?: PluginManagerOptions['logger'];
  timeoutMs?: number;
  /** 默认 true：创建时立即读清单并加载。 */
  autoLoad?: boolean;
}

export interface ElectronPluginRuntime {
  manager: PluginManager;
  dispose(): Promise<void>;
}

/**
 * Electron 主进程接线：`app.getPath('userData')` → plugins 目录 → IPC。
 *
 * 注意：`apps/desktop` 没有把 electron 作为 runtime 依赖；这个文件只依赖
 * 上面两个结构类型，测试时传假对象即可。
 */
export async function createElectronPluginRuntime(
  options: ElectronPluginRuntimeOptions,
): Promise<ElectronPluginRuntime> {
  const manager = new PluginManager({
    userDataDir: options.app.getPath('userData'),
    taskStore: options.taskStore,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });

  registerPluginIpc(options.ipcMain, manager);
  if (options.autoLoad !== false) await manager.loadAll();

  return {
    manager,
    dispose: async () => {
      await manager.dispose();
    },
  };
}
