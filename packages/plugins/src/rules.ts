import { BUILTIN_PLUGINS } from './index.ts';

/**
 * 现有插件的规则清单（机器可读）。
 *
 * 字段尽量从 manifest 推导，避免"文档一份、代码一份"漂移；
 * slots / 主题 / 转换器这类只在 activate 里注册的东西，用静态补充表。
 * 人类可读版见 `docs/PLUGINS.md`。
 */
export interface PluginRule {
  id: string;
  name: string;
  version: string;
  /** 所属 npm 包：插件拆包后填对应的 `gofor-plugin-*` workspace 包名。 */
  packageName: string;
  permissions: string[];
  screens: string[];
  printBlocks: string[];
  /** 扫描回填处理器 id（`<pluginId>/scan`）；没有处理数据的能力时为 null。 */
  scanHandler: string | null;
  slots: string[];
  themes: string[];
  converters: string[];
  /** 默认是否启用（主题包默认关闭）。 */
  enabledByDefault: boolean;
}

/**
 * 内置插件 id → 所属子包名。
 *
 * 插件已拆成独立 workspace 包，`packageName` 不能再统一填宿主包；
 * 新增内置插件时必须在这里登记，否则直接报错，避免静默写错包名。
 */
const PACKAGE_BY_ID: Readonly<Record<string, string>> = {
  'gofor.checkin': 'gofor-plugin-checkin',
  'gofor.checklist': 'gofor-plugin-checklist',
  'gofor.convert': 'gofor-plugin-converter',
  'gofor.diary': 'gofor-plugin-diary',
  'gofor.mood': 'gofor-plugin-mood',
  'gofor.pomodoro': 'gofor-plugin-pomodoro',
  'gofor.report': 'gofor-plugin-report',
  'gofor.scan': 'gofor-plugin-scan',
  'gofor.tasks': 'gofor-plugin-tasks',
  'gofor.theme.sepia': 'gofor-plugin-theme',
  'gofor.timetable': 'gofor-plugin-timetable',
  'gofor.toolbox': 'gofor-plugin-toolbox',
  'gofor.wordbook': 'gofor-plugin-wordbook',
};

function packageNameOf(id: string): string {
  const name = PACKAGE_BY_ID[id];
  if (name === undefined) throw new Error(`未登记内置插件的包名：${id}`);
  return name;
}

const EXTRA_RULES: Record<
  string,
  Pick<PluginRule, 'slots'> & Partial<Pick<PluginRule, 'themes' | 'converters'>>
> = {
  'gofor.wordbook': { slots: ['home.after-stats'] },
  'gofor.theme.sepia': { slots: ['app.header.right'] },
};

const DEFAULT_DISABLED = new Set(['gofor.theme.sepia']);

export const PLUGIN_RULES: readonly PluginRule[] = BUILTIN_PLUGINS.map((plugin) => {
  const manifest = plugin.manifest;
  const extra = EXTRA_RULES[manifest.id];
  const canHandleScan = manifest.permissions.includes('scan.handle');
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    packageName: packageNameOf(manifest.id),
    permissions: [...manifest.permissions],
    screens: manifest.provides?.screens ?? [],
    printBlocks: manifest.provides?.printBlocks ?? [],
    scanHandler: canHandleScan ? `${manifest.id}/scan` : null,
    slots: extra?.slots ?? [],
    themes: manifest.provides?.themes ?? [],
    converters: manifest.provides?.converters ?? [],
    enabledByDefault: !DEFAULT_DISABLED.has(manifest.id),
  };
});

export function pluginRule(id: string): PluginRule | undefined {
  return PLUGIN_RULES.find((rule) => rule.id === id);
}
