import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createElectronPluginRuntime,
  type IpcMainLike,
  PLUGIN_IPC_CHANNELS,
  PluginManager,
  registerPluginIpc,
  silentLogger,
  type TaskStore,
} from '../src/index.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeUserData(): string {
  const root = mkdtempSync(join(tmpdir(), 'gofor-plugin-ipc-'));
  roots.push(root);
  mkdirSync(join(root, 'plugins'), { recursive: true });
  writeFileSync(join(root, 'plugins', 'gofor.plugins.json'), JSON.stringify({ enabled: [] }));
  return root;
}

const taskStore: TaskStore = {
  getTasks: async () => [],
  updateTask: async () => undefined,
};

function fakeIpcMain(): IpcMainLike & { handlers: Map<string, unknown> } {
  const handlers = new Map<string, unknown>();
  return {
    handlers,
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };
}

describe('IPC', () => {
  it('只注册 snapshot / reload / run-command，并可在 dispose 后移除', async () => {
    const manager = new PluginManager({
      userDataDir: makeUserData(),
      taskStore,
      logger: silentLogger,
    });
    const ipcMain = fakeIpcMain();
    const dispose = registerPluginIpc(ipcMain, manager);

    expect([...ipcMain.handlers.keys()].sort()).toEqual(
      [
        PLUGIN_IPC_CHANNELS.snapshot,
        PLUGIN_IPC_CHANNELS.reload,
        PLUGIN_IPC_CHANNELS.runCommand,
      ].sort(),
    );

    const snapshotHandler = ipcMain.handlers.get(PLUGIN_IPC_CHANNELS.snapshot) as (
      event: unknown,
    ) => { version: number; plugins: unknown[] };
    expect(snapshotHandler({})).toMatchObject({ version: 0, plugins: [] });

    const runCommand = ipcMain.handlers.get(PLUGIN_IPC_CHANNELS.runCommand) as (
      event: unknown,
      id: unknown,
    ) => Promise<{ ok: boolean; error: string | null }>;
    await expect(runCommand({}, 42)).resolves.toEqual({
      ok: false,
      error: '命令 id 必须是非空字符串',
    });

    dispose();
    expect(ipcMain.handlers.size).toBe(0);
  });

  it('createElectronPluginRuntime 用 app.getPath(userData) 并自动加载', async () => {
    const userData = makeUserData();
    const ipcMain = fakeIpcMain();
    const runtime = await createElectronPluginRuntime({
      app: { getPath: () => userData },
      ipcMain,
      taskStore,
      logger: silentLogger,
    });

    expect(runtime.manager.pluginsDir).toBe(join(userData, 'plugins'));
    expect(ipcMain.handlers.has(PLUGIN_IPC_CHANNELS.snapshot)).toBe(true);
    await expect(runtime.manager.reloadPlugins()).resolves.toMatchObject({ plugins: [] });
    await runtime.dispose();
  });
});
