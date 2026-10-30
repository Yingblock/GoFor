import { type PnpmRunner, runPnpm } from './pnpm.js';
import {
  ensurePluginsDir,
  type InstalledPackage,
  listInstalledPackages,
  pluginsDirFor,
  readEnabledPlugins,
  writeEnabledPlugins,
} from './state.js';

export interface CommandOptions {
  /** 等价于 Electron `app.getPath('userData')`。 */
  userDataDir: string;
  /** 测试注入；默认真的执行 pnpm。 */
  run?: PnpmRunner;
}

export interface AddPluginResult {
  packageName: string;
  pluginsDir: string;
  enabled: string[];
}

export interface RemovePluginResult {
  packageName: string;
  pluginsDir: string;
  enabled: string[];
}

const PLUGIN_PACKAGE_NAME = /^gofor-plugin-[a-z0-9][a-z0-9-]*$/;

export function assertPluginPackageName(packageName: string): void {
  if (!PLUGIN_PACKAGE_NAME.test(packageName)) {
    throw new Error(
      `包名必须是 gofor-plugin-*（小写字母/数字/-），收到：${JSON.stringify(packageName)}`,
    );
  }
}

/**
 * `gofor plugin add <pkg>`：
 * 在 `userData/plugins` 执行 `pnpm add <pkg>`，成功后把包名写进 enabled。
 *
 * 不自动 reload：CLI 是独立进程，加载器在主进程里；提示用户重启或调 reloadPlugins()。
 */
export function addPlugin(packageName: string, options: CommandOptions): AddPluginResult {
  assertPluginPackageName(packageName);
  const pluginsDir = pluginsDirFor(options.userDataDir);
  ensurePluginsDir(pluginsDir);

  const run = options.run ?? runPnpm;
  const status = run(['add', packageName], pluginsDir);
  if (status !== 0) {
    throw new Error(`pnpm add ${packageName} 失败（退出码 ${status}）`);
  }

  const enabled = readEnabledPlugins(pluginsDir);
  if (!enabled.includes(packageName)) enabled.push(packageName);
  writeEnabledPlugins(pluginsDir, enabled);

  return { packageName, pluginsDir, enabled };
}

/**
 * `gofor plugin remove <pkg>`：
 * 执行 `pnpm remove <pkg>`，从 enabled 删除。插件数据不在这里删。
 */
export function removePlugin(packageName: string, options: CommandOptions): RemovePluginResult {
  assertPluginPackageName(packageName);
  const pluginsDir = pluginsDirFor(options.userDataDir);
  ensurePluginsDir(pluginsDir);

  const run = options.run ?? runPnpm;
  const status = run(['remove', packageName], pluginsDir);
  if (status !== 0) {
    throw new Error(`pnpm remove ${packageName} 失败（退出码 ${status}）`);
  }

  const enabled = readEnabledPlugins(pluginsDir).filter((name) => name !== packageName);
  writeEnabledPlugins(pluginsDir, enabled);

  return { packageName, pluginsDir, enabled };
}

/** `gofor plugin list`：依赖列表与 enabled 的并集，缺 manifest 的也显示出来。 */
export function listPlugins(userDataDir: string): {
  pluginsDir: string;
  packages: InstalledPackage[];
} {
  const pluginsDir = pluginsDirFor(userDataDir);
  return { pluginsDir, packages: listInstalledPackages(pluginsDir) };
}
