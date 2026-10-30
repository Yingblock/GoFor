import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addPlugin,
  defaultUserDataDir,
  ensurePluginsDir,
  listInstalledPackages,
  pluginsDirFor,
  readEnabledPlugins,
  removePlugin,
  runCli,
  writeEnabledPlugins,
} from '../src/index.ts';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'gofor-plugin-cli-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('defaultUserDataDir', () => {
  it('按平台给出 Electron 默认目录，GOFOR_USER_DATA 优先', () => {
    expect(
      defaultUserDataDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/x' }, home: '/h' }),
    ).toBe('/x/GoFor');
    expect(defaultUserDataDir({ platform: 'darwin', env: {}, home: '/h' })).toBe(
      '/h/Library/Application Support/GoFor',
    );
    expect(
      defaultUserDataDir({
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' },
        home: 'C:\\Users\\a',
      }),
    ).toBe('C:\\Users\\a\\AppData\\Roaming\\GoFor');
    expect(
      defaultUserDataDir({ platform: 'linux', env: { GOFOR_USER_DATA: '/custom' }, home: '/h' }),
    ).toBe('/custom');
  });
});

describe('plugins 目录与清单', () => {
  it('ensure 幂等，不覆盖已有 enabled', () => {
    const root = makeRoot();
    const dir = pluginsDirFor(root);
    ensurePluginsDir(dir);
    writeEnabledPlugins(dir, ['gofor-plugin-a']);
    ensurePluginsDir(dir);

    expect(readEnabledPlugins(dir)).toEqual(['gofor-plugin-a']);
    const packageJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('gofor-plugins');
    expect(packageJson.private).toBe(true);
  });

  it('enabled 去重、忽略非字符串；损坏清单报错', () => {
    const root = makeRoot();
    const dir = pluginsDirFor(root);
    ensurePluginsDir(dir);
    writeFileSync(
      join(dir, 'gofor.plugins.json'),
      JSON.stringify({ enabled: ['a', 'a', 42, 'b'] }),
    );
    expect(readEnabledPlugins(dir)).toEqual(['a', 'b']);

    writeFileSync(join(dir, 'gofor.plugins.json'), '{bad');
    expect(() => readEnabledPlugins(dir)).toThrow('不是合法 JSON');
  });
});

describe('add / remove', () => {
  it('add 执行 pnpm add，并把包名写进 enabled', () => {
    const root = makeRoot();
    const calls: Array<{ args: readonly string[]; cwd: string }> = [];
    const result = addPlugin('gofor-plugin-hello', {
      userDataDir: root,
      run: (args, cwd) => {
        calls.push({ args, cwd });
        return 0;
      },
    });

    expect(calls).toEqual([{ args: ['add', 'gofor-plugin-hello'], cwd: join(root, 'plugins') }]);
    expect(result.enabled).toEqual(['gofor-plugin-hello']);
    expect(readEnabledPlugins(join(root, 'plugins'))).toEqual(['gofor-plugin-hello']);
  });

  it('add 失败时不改 enabled', () => {
    const root = makeRoot();
    const dir = pluginsDirFor(root);
    ensurePluginsDir(dir);
    writeEnabledPlugins(dir, ['gofor-plugin-existing']);

    expect(() => addPlugin('gofor-plugin-bad', { userDataDir: root, run: () => 1 })).toThrow(
      'pnpm add gofor-plugin-bad 失败',
    );
    expect(readEnabledPlugins(dir)).toEqual(['gofor-plugin-existing']);
  });

  it('拒绝非 gofor-plugin-* 包名', () => {
    const root = makeRoot();
    expect(() => addPlugin('lodash', { userDataDir: root, run: () => 0 })).toThrow(
      '包名必须是 gofor-plugin-*',
    );
    expect(() => removePlugin('@scope/plugin', { userDataDir: root, run: () => 0 })).toThrow(
      '包名必须是 gofor-plugin-*',
    );
  });

  it('remove 执行 pnpm remove，并从 enabled 删除', () => {
    const root = makeRoot();
    const dir = pluginsDirFor(root);
    ensurePluginsDir(dir);
    writeEnabledPlugins(dir, ['gofor-plugin-a', 'gofor-plugin-b']);

    const calls: string[][] = [];
    const result = removePlugin('gofor-plugin-a', {
      userDataDir: root,
      run: (args) => {
        calls.push([...args]);
        return 0;
      },
    });

    expect(calls).toEqual([['remove', 'gofor-plugin-a']]);
    expect(result.enabled).toEqual(['gofor-plugin-b']);
    expect(readEnabledPlugins(dir)).toEqual(['gofor-plugin-b']);
  });
});

describe('list', () => {
  it('列出依赖、enabled 与 manifest，缺失也不崩', () => {
    const root = makeRoot();
    const dir = pluginsDirFor(root);
    ensurePluginsDir(dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'gofor-plugins',
        private: true,
        dependencies: { 'gofor-plugin-hello': '^0.1.0', 'gofor-plugin-missing': '^1.0.0' },
      }),
    );
    writeEnabledPlugins(dir, ['gofor-plugin-hello']);

    const helloDir = join(dir, 'node_modules', 'gofor-plugin-hello');
    mkdirSync(helloDir, { recursive: true });
    writeFileSync(
      join(helloDir, 'package.json'),
      JSON.stringify({
        name: 'gofor-plugin-hello',
        version: '0.1.0',
        gofor: {
          id: 'plugin-hello',
          displayName: 'Hello',
          version: '0.1.0',
          main: './dist/index.js',
          apiVersion: '1',
          capabilities: [],
        },
      }),
    );

    const packages = listInstalledPackages(dir);
    expect(packages.find((item) => item.packageName === 'gofor-plugin-hello')).toMatchObject({
      enabled: true,
      hasManifest: true,
      id: 'plugin-hello',
      version: '0.1.0',
    });
    expect(packages.find((item) => item.packageName === 'gofor-plugin-missing')).toMatchObject({
      enabled: false,
      hasManifest: false,
      version: '—',
    });
  });
});

describe('runCli', () => {
  it('list 输出目录与启用列，退出码 0', () => {
    const root = makeRoot();
    ensurePluginsDir(pluginsDirFor(root));
    const lines: string[] = [];
    const code = runCli(['plugin', 'list', '--user-data', root], {
      out: (line) => lines.push(line),
      err: () => undefined,
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('插件目录：');
    expect(lines.join('\n')).toContain('还没有安装插件');
  });

  it('参数错误退出码 2；未知命令提示用法', () => {
    const errors: string[] = [];
    const io = { out: () => undefined, err: (line: string) => errors.push(line) };
    expect(runCli([], io)).toBe(2);
    expect(runCli(['plugin', 'add'], io)).toBe(2);
    expect(runCli(['nope'], io)).toBe(2);
    expect(errors.join('\n')).toContain('需要一个包名');
    expect(errors.join('\n')).toContain('未知命令');
  });

  it('--user-data 缺值报错', () => {
    const errors: string[] = [];
    const code = runCli(['plugin', 'list', '--user-data'], {
      out: () => undefined,
      err: (line) => errors.push(line),
    });
    expect(code).toBe(2);
    expect(errors[0]).toContain('需要一个目录参数');
  });
});

describe('目录安全', () => {
  it('add 会创建 plugins 目录与两个清单文件', () => {
    const root = makeRoot();
    addPlugin('gofor-plugin-first', { userDataDir: root, run: () => 0 });
    const dir = join(root, 'plugins');
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'gofor.plugins.json'))).toBe(true);
  });
});
