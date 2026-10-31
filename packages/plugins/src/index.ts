import type { PluginModule } from '@gofor/plugin-api';

/**
 * 构建期插件注册表。
 *
 * 当前为 **0**：12 个原有插件已迁移到 `external-plugins/`，由 plugin-host 作为
 * 外部插件加载（见 tools/build-external-plugins.mjs）。之后由用户决定哪些
 * 插件重新放回构建期。
 */
export const BUILTIN_PLUGINS: readonly PluginModule[] = [];

/** 默认关闭的内置插件；当前没有内置插件。 */
export function isBuiltinEnabledByDefault(_id: string): boolean {
  return true;
}

/** 内置插件的 manifest JSON（播种进 `plugins` 表用）。 */
export function builtinManifestJson(plugin: PluginModule): string {
  return JSON.stringify(plugin.manifest);
}
