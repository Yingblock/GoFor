export { type CliIo, runCli } from './cli.js';
export {
  type AddPluginResult,
  addPlugin,
  assertPluginPackageName,
  type CommandOptions,
  listPlugins,
  type RemovePluginResult,
  removePlugin,
} from './commands.js';
export { defaultUserDataDir, type UserDataOptions } from './paths.js';
export { type PnpmRunner, runPnpm } from './pnpm.js';
export {
  ensurePluginsDir,
  type InstalledPackage,
  listInstalledPackages,
  PLUGINS_MANIFEST_FILE,
  type PluginsManifest,
  pluginsDirFor,
  readEnabledPlugins,
  writeEnabledPlugins,
} from './state.js';
