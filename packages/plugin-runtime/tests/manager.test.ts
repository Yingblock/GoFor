import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task } from '@gofor/contracts';
import { PLUGIN_API_VERSION, PLUGIN_CAPABILITIES } from '@gofor/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KNOWN_CAPABILITIES,
  PluginManager,
  SUPPORTED_API_VERSION,
  silentLogger,
  type TaskStore,
} from '../src/index.ts';

interface Fixture {
  root: string;
  pluginsDir: string;
  callsPath: string;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(enabled: string[]): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'gofor-plugin-runtime-'));
  roots.push(root);
  const pluginsDir = join(root, 'plugins');
  mkdirSync(join(pluginsDir, 'node_modules'), { recursive: true });
  writeFileSync(
    join(pluginsDir, 'package.json'),
    JSON.stringify({ name: 'gofor-plugins', private: true, version: '0.0.0' }),
  );
  writeFileSync(join(pluginsDir, 'gofor.plugins.json'), JSON.stringify({ enabled }));
  return { root, pluginsDir, callsPath: join(root, 'calls.log') };
}

interface WritePluginOptions {
  packageName: string;
  body: string;
  gofor?: Record<string, unknown>;
  main?: string;
}

function writePlugin(fixture: Fixture, options: WritePluginOptions): void {
  const { packageName, body, main = './dist/index.js' } = options;
  const dir = join(fixture.pluginsDir, 'node_modules', packageName);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  const gofor = {
    id: `plugin-${packageName.replace(/^gofor-plugin-/, '')}`,
    displayName: packageName,
    version: '0.1.0',
    main,
    apiVersion: '1',
    capabilities: ['command', 'view-slot', 'print-template'],
    ...options.gofor,
  };
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: packageName, version: '0.1.0', main: './dist/index.js', gofor }),
  );
  writeFileSync(join(dir, 'dist', 'index.js'), body);
}

function createTaskStore(tasks: Task[] = []): {
  store: TaskStore;
  updates: Array<{ id: string; patch: Partial<Task> }>;
} {
  const updates: Array<{ id: string; patch: Partial<Task> }> = [];
  return {
    updates,
    store: {
      getTasks: async () => tasks,
      updateTask: async (id, patch) => {
        updates.push({ id, patch });
      },
    },
  };
}

function createManager(
  fixture: Fixture,
  options: { timeoutMs?: number; silent?: boolean } = {},
): PluginManager {
  const { store } = createTaskStore();
  return new PluginManager({
    userDataDir: fixture.root,
    taskStore: store,
    ...(options.silent === false ? {} : { logger: silentLogger }),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}

describe('契约常量', () => {
  it('运行时与 @gofor/contracts 的版本/能力清单一致', () => {
    expect(SUPPORTED_API_VERSION).toBe(PLUGIN_API_VERSION);
    expect(KNOWN_CAPABILITIES).toEqual(PLUGIN_CAPABILITIES);
  });
});

describe('PluginManager 加载', () => {
  it('成功激活并登记命令、插槽、打印模板', async () => {
    const fixture = createFixture(['gofor-plugin-hello']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-hello',
      gofor: { renderer: './dist/renderer.js' },
      body: `
        exports.activate = (api) => {
          api.registerCommand({ id: 'plugin-hello/say', title: '打招呼', handler: () => {} });
          api.registerViewSlot('home.after-stats', { displayName: 'HelloSlot' });
          api.registerPrintTemplate({ id: 'plugin-hello/print', render: (task) => task.title });
        };
      `,
    });

    const manager = createManager(fixture);
    const snapshot = await manager.loadAll();

    expect(snapshot.plugins).toHaveLength(1);
    expect(snapshot.plugins[0]?.state).toBe('active');
    expect(snapshot.plugins[0]?.error).toBeNull();
    expect(snapshot.commands.map((command) => command.id)).toEqual(['plugin-hello/say']);
    expect(snapshot.slots).toEqual([
      {
        slotId: 'home.after-stats',
        pluginId: 'plugin-hello',
        packageName: 'gofor-plugin-hello',
        renderer: './dist/renderer.js',
        componentName: 'HelloSlot',
      },
    ]);
    expect(snapshot.printTemplates.map((template) => template.id)).toEqual(['plugin-hello/print']);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    await manager.dispose();
  });

  it('v2：登记页面/主题/数据/扫描声明并进入快照', async () => {
    const fixture = createFixture(['gofor-plugin-v2']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-v2',
      gofor: {
        capabilities: ['screen', 'theme', 'data', 'scan'],
        permissions: ['ui.screen', 'ui.theme', 'data.provide', 'scan.handle'],
        renderer: './renderer.mjs',
      },
      body: `
        exports.activate = (api) => {
          api.registerScreen({
            id: 'plugin-v2/screen',
            title: 'V2',
            group: '离线·M3',
            component: 'V2Screen',
          });
          api.registerTheme({
            id: 'plugin-v2/theme',
            name: 'V2 主题',
            tokens: { '--color-accent': '#f00' },
          });
          api.registerData({ id: 'v2.entries', version: 1, summary: 'V2 数据' });
          api.registerScanHandler({ id: 'plugin-v2/scan', owner: 'plugin-v2' });
        };
      `,
    });

    const snapshot = await createManager(fixture).loadAll();
    expect(snapshot.plugins[0]?.permissions).toEqual([
      'ui.screen',
      'ui.theme',
      'data.provide',
      'scan.handle',
    ]);
    expect(snapshot.screens[0]).toMatchObject({
      id: 'plugin-v2/screen',
      component: 'V2Screen',
      renderer: './renderer.mjs',
    });
    expect(snapshot.themes[0]?.tokens).toEqual({ '--color-accent': '#f00' });
    expect(snapshot.data[0]?.id).toBe('v2.entries');
    expect(snapshot.scanHandlers[0]?.owner).toBe('plugin-v2');
  });

  it('单个插件 activate 抛错不影响其他插件', async () => {
    const fixture = createFixture(['gofor-plugin-bad', 'gofor-plugin-good']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-bad',
      body: `exports.activate = () => { throw new Error('故意的失败'); };`,
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-good',
      body: `exports.activate = (api) => api.registerCommand({ id: 'good/run', title: '好', handler: () => {} });`,
    });

    const snapshot = await createManager(fixture).loadAll();
    const byName = new Map(snapshot.plugins.map((plugin) => [plugin.packageName, plugin]));

    expect(byName.get('gofor-plugin-bad')?.state).toBe('failed');
    expect(byName.get('gofor-plugin-bad')?.error).toContain('故意的失败');
    expect(byName.get('gofor-plugin-good')?.state).toBe('active');
    expect(snapshot.commands.map((command) => command.id)).toEqual(['good/run']);
  });

  it('activate 超过 5s 超时（测试用 30ms）后标记 failed，不留下半截注册', async () => {
    const fixture = createFixture(['gofor-plugin-slow', 'gofor-plugin-good']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-slow',
      body: `
        exports.activate = (api) => {
          api.registerCommand({ id: 'slow/early', title: '早注册', handler: () => {} });
          return new Promise((resolve) => {
            setTimeout(() => {
              api.registerCommand({ id: 'slow/late', title: '迟到', handler: () => {} });
              resolve();
            }, 80);
          });
        };
      `,
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-good',
      body: `exports.activate = (api) => api.registerCommand({ id: 'good/run', title: '好', handler: () => {} });`,
    });

    const manager = createManager(fixture, { timeoutMs: 30 });
    const snapshot = await manager.loadAll();
    const slow = snapshot.plugins.find((plugin) => plugin.packageName === 'gofor-plugin-slow');
    expect(slow?.state).toBe('failed');
    expect(slow?.error).toContain('activate 超过 30ms');
    expect(snapshot.commands.map((command) => command.id)).toEqual(['good/run']);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(manager.snapshot().commands.map((command) => command.id)).toEqual(['good/run']);
  });

  it('apiVersion 不匹配 → incompatible，不激活', async () => {
    const fixture = createFixture(['gofor-plugin-old']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-old',
      gofor: { apiVersion: '0' },
      body: `exports.activate = () => { throw new Error('不应该被调用'); };`,
    });

    const snapshot = await createManager(fixture).loadAll();
    expect(snapshot.plugins[0]?.state).toBe('incompatible');
    expect(snapshot.plugins[0]?.error).toContain('apiVersion 0');
    expect(snapshot.commands).toEqual([]);
  });

  it('清单缺失/损坏 → 空快照，不抛错', async () => {
    const fixture = createFixture([]);
    rmSync(join(fixture.pluginsDir, 'gofor.plugins.json'));
    const empty = await createManager(fixture).loadAll();
    expect(empty.plugins).toEqual([]);

    writeFileSync(join(fixture.pluginsDir, 'gofor.plugins.json'), '{ not json');
    const broken = await createManager(fixture).loadAll();
    expect(broken.plugins).toEqual([]);
  });

  it('两个包声明同一个 gofor.id → 后者 failed，不覆盖前者', async () => {
    const fixture = createFixture(['gofor-plugin-a', 'gofor-plugin-b']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-a',
      gofor: { id: 'plugin-dupe' },
      body: `exports.activate = (api) => api.registerCommand({ id: 'a/run', title: 'A', handler: () => {} });`,
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-b',
      gofor: { id: 'plugin-dupe' },
      body: `exports.activate = (api) => api.registerCommand({ id: 'b/run', title: 'B', handler: () => {} });`,
    });

    const snapshot = await createManager(fixture).loadAll();
    expect(snapshot.plugins.find((plugin) => plugin.packageName === 'gofor-plugin-a')?.state).toBe(
      'active',
    );
    const duplicate = snapshot.plugins.find((plugin) => plugin.packageName === 'gofor-plugin-b');
    expect(duplicate?.state).toBe('failed');
    expect(duplicate?.error).toContain('插件 id 冲突');
    expect(snapshot.commands.map((command) => command.id)).toEqual(['a/run']);
  });

  it('包没安装 → failed，其余插件继续', async () => {
    const fixture = createFixture(['gofor-plugin-missing', 'gofor-plugin-good']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-good',
      body: `exports.activate = () => {};`,
    });

    const snapshot = await createManager(fixture).loadAll();
    const missing = snapshot.plugins.find(
      (plugin) => plugin.packageName === 'gofor-plugin-missing',
    );
    expect(missing?.state).toBe('failed');
    expect(
      snapshot.plugins.find((plugin) => plugin.packageName === 'gofor-plugin-good')?.state,
    ).toBe('active');
  });

  it('未声明 capability 就注册 → 激活失败', async () => {
    const fixture = createFixture(['gofor-plugin-nocap']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-nocap',
      gofor: { capabilities: ['view-slot'] },
      body: `exports.activate = (api) => api.registerCommand({ id: 'x/y', title: 'x', handler: () => {} });`,
    });

    const snapshot = await createManager(fixture).loadAll();
    expect(snapshot.plugins[0]?.state).toBe('failed');
    expect(snapshot.plugins[0]?.error).toContain('未声明 "command"');
  });
});

describe('PluginManager 生命周期', () => {
  it('reloadPlugins 调 deactivate 后重新激活', async () => {
    const fixture = createFixture(['gofor-plugin-life']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-life',
      body: `
        const fs = require('node:fs');
        exports.activate = (api) => {
          fs.appendFileSync(${JSON.stringify(fixture.callsPath)}, 'activate\\n');
          api.registerCommand({ id: 'life/run', title: '生命', handler: () => {} });
        };
        exports.deactivate = () => fs.appendFileSync(${JSON.stringify(fixture.callsPath)}, 'deactivate\\n');
      `,
    });

    const manager = createManager(fixture);
    const first = await manager.loadAll();
    const reloaded = await manager.reloadPlugins();

    expect(reloaded.version).toBeGreaterThan(first.version);
    expect(readFileSync(fixture.callsPath, 'utf8').trim().split('\n')).toEqual([
      'activate',
      'deactivate',
      'activate',
    ]);
    expect(reloaded.commands.map((command) => command.id)).toEqual(['life/run']);
    await manager.dispose();
  });

  it('deactivate 抛错不影响卸载流程', async () => {
    const fixture = createFixture(['gofor-plugin-badbye']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-badbye',
      body: `
        exports.activate = () => {};
        exports.deactivate = () => { throw new Error('bye 失败'); };
      `,
    });

    const manager = createManager(fixture);
    await manager.loadAll();
    await expect(manager.reloadPlugins()).resolves.toBeDefined();
    expect(manager.snapshot().plugins[0]?.state).toBe('active');
  });
});

describe('PluginManager 宿主能力', () => {
  it('getTasks/updateTask 走注入的 TaskStore', async () => {
    const fixture = createFixture(['gofor-plugin-task']);
    const task: Task = {
      id: 't1',
      title: '数学卷子',
      subjectId: null,
      done: false,
      due: null,
      sortKey: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    writePlugin(fixture, {
      packageName: 'gofor-plugin-task',
      body: `
        const fs = require('node:fs');
        exports.activate = async (api) => {
          const tasks = await api.getTasks();
          fs.writeFileSync(${JSON.stringify(fixture.callsPath)}, JSON.stringify(tasks));
          await api.updateTask('t1', { done: true });
        };
      `,
    });

    const { store, updates } = createTaskStore([task]);
    const manager = new PluginManager({
      userDataDir: fixture.root,
      taskStore: store,
      logger: silentLogger,
    });
    await manager.loadAll();

    expect(JSON.parse(readFileSync(fixture.callsPath, 'utf8'))).toEqual([task]);
    expect(updates).toEqual([{ id: 't1', patch: { done: true } }]);
  });

  it('runCommand 返回结构化结果，未知命令不抛', async () => {
    const fixture = createFixture(['gofor-plugin-command']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-command',
      body: `
        exports.activate = (api) => {
          api.registerCommand({
            id: 'cmd/ok',
            title: '好命令',
            handler: () => { throw new Error('命令内部错误'); },
          });
        };
      `,
    });

    const manager = createManager(fixture);
    await manager.loadAll();
    expect(await manager.runCommand('cmd/ok')).toEqual({
      ok: false,
      error: '命令内部错误',
    });
    expect(await manager.runCommand('cmd/nope')).toEqual({
      ok: false,
      error: '未注册的命令：cmd/nope',
    });
  });

  it('默认日志写到 userData/logs/plugins.log', async () => {
    const fixture = createFixture(['gofor-plugin-log']);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-log',
      body: `exports.activate = () => {};`,
    });

    const { store } = createTaskStore();
    const manager = new PluginManager({ userDataDir: fixture.root, taskStore: store });
    await manager.loadAll();

    const logPath = join(fixture.root, 'logs', 'plugins.log');
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, 'utf8')).toContain('已激活');
    await manager.dispose();
  });
});

describe('manifest 校验', () => {
  it('拒绝绝对路径、目录穿越、非法 id、未知能力', async () => {
    const fixture = createFixture([
      'gofor-plugin-abs',
      'gofor-plugin-escape',
      'gofor-plugin-id',
      'gofor-plugin-cap',
    ]);
    writePlugin(fixture, {
      packageName: 'gofor-plugin-abs',
      gofor: { main: '/tmp/index.js' },
      body: '',
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-escape',
      gofor: { main: './../../escape.js' },
      body: '',
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-id',
      gofor: { id: 'Plugin_Bad' },
      body: '',
    });
    writePlugin(fixture, {
      packageName: 'gofor-plugin-cap',
      gofor: { capabilities: ['teleport'] },
      body: '',
    });

    const snapshot = await createManager(fixture).loadAll();
    const errors = snapshot.plugins.map((plugin) => plugin.error ?? '');
    expect(errors.every((message) => message !== '')).toBe(true);
    expect(errors.join('\n')).toContain('相对包根目录');
    expect(errors.join('\n')).toContain('跳出包目录');
    expect(errors.join('\n')).toContain('gofor.id 非法');
    expect(errors.join('\n')).toContain('未知能力');
  });
});
