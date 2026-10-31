import type { PluginModule } from '@gofor/plugin-api';

/**
 * 构建期插件注册表。
 *
 * 用 Vite 的 `import.meta.glob` 在构建时扫描 `plugins/*`，而不是在这里静态 import：
 * 删掉任意 `plugins/<name>` 后重新构建，它就自动从产物里消失，不需要手改本文件
 * 或 `package.json`（静态 import 会在删目录后直接编译失败）。
 *
 * `eager: true` 只是把匹配到的模块并进当前 bundle；页面本身仍由各插件懒加载。
 */
const PLUGIN_MODULES = import.meta.glob<Record<string, unknown>>(
  '../../../plugins/*/src/index.ts',
  { eager: true },
);

/** 原 BUILTIN_PLUGINS 的稳定顺序；未知目录按字母序追加。 */
const KNOWN_ORDER = [
  'pomodoro',
  'tasks',
  'timetable',
  'checkin',
  'scan',
  'checklist',
  'mood',
  'report',
  'diary',
  'toolbox',
  'wordbook',
  'theme',
  'converter',
];

function isPluginModule(value: unknown): value is PluginModule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { activate?: unknown; manifest?: unknown };
  return typeof candidate.activate === 'function' && typeof candidate.manifest === 'object';
}

function pluginDirOf(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 3] ?? path;
}

const byDir = new Map<string, PluginModule>();
for (const [path, exports] of Object.entries(PLUGIN_MODULES)) {
  const plugin = Object.values(exports).find(isPluginModule);
  if (plugin) {
    byDir.set(pluginDirOf(path), plugin);
  } else {
    console.warn(`[plugins] ${path} 没有导出 PluginModule，已忽略`);
  }
}

const ordered: PluginModule[] = [];
for (const dir of KNOWN_ORDER) {
  const plugin = byDir.get(dir);
  if (plugin) {
    ordered.push(plugin);
    byDir.delete(dir);
  }
}
ordered.push(
  ...[...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, plugin]) => plugin),
);

/**
 * 当前存在的构建期插件。顺序决定：
 * - 依赖解析之外的稳定激活顺序；
 * - 多个主题包同时启用时哪个生效（第一个）；
 * - 安装页的展示顺序。
 */
export const BUILTIN_PLUGINS: readonly PluginModule[] = ordered;

/**
 * 默认关闭的内置插件。
 *
 * 主题包是唯一一个：它一启用就改整站外观，应该是用户主动选择的，
 * 不能"装好就变样"。其它内置插件（清单/周报/单词库…）默认开启，
 * 否则升级后用户会发现功能"消失"。
 */
const DEFAULT_DISABLED = new Set(['gofor.theme.sepia']);

export function isBuiltinEnabledByDefault(id: string): boolean {
  return !DEFAULT_DISABLED.has(id);
}

/** 内置插件的 manifest JSON（播种进 `plugins` 表用）。 */
export function builtinManifestJson(plugin: PluginModule): string {
  return JSON.stringify(plugin.manifest);
}
