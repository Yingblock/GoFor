/**
 * 插件权限。
 *
 * 权限不是沙箱（构建期插件本来就在页面主线程里跑），它解决的是另外两件事：
 * 1. 插件目录能用人话告诉用户「这个插件会做什么」；
 * 2. 注册项在运行期真的会检查权限，插件不能靠"忘记声明"偷偷加一个页面或读数据。
 *
 * 与 `docs/DECISIONS/0004-plugin-extension-boundaries.md` 的边界一致：
 * 没有 `ui.dom` 这类能接管外壳的权限，插件只能在宿主给的盒子里改。
 */

export const PLUGIN_PERMISSIONS = [
  'ui.screen',
  'print.template',
  'ui.home',
  'ui.slot',
  'ui.theme',
  'ui.css',
  'command',
  'data.read',
  'data.provide',
  'storage',
  'converter',
  'connector',
  'scan.handle',
  'ocr',
  'ai',
  'network',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/**
 * 安装页展示用的白话说明。
 *
 * 写"能做什么"而不是"对应哪个 API"：用户不需要知道 `ui.slot` 是什么，
 * 但需要知道"这个插件会在首页加一块内容"。
 */
export const PERMISSION_LABELS: Readonly<Record<PluginPermission, string>> = {
  'ui.screen': '新增一个自己的页面（出现在侧栏）',
  'print.template': '注册打印模板（决定纸上印什么）',
  'ui.home': '在首页注册一块内容（可拖拽排序）',
  'ui.slot': '在首页/页头/侧栏的固定位置追加内容',
  'ui.theme': '修改屏幕层的颜色等主题变量（改不到纸上）',
  'ui.css': '给屏幕层加样式（只在自己那块界面里生效）',
  command: '往命令面板加命令与快捷键',
  'data.read': '读取其他插件或内置模块提供的数据',
  'data.provide': '向其他插件提供只读数据',
  storage: '在本机保存自己的数据（会进入备份）',
  converter: '注册文件转换器（在 Worker 里执行）',
  'scan.handle': '接收扫描识别结果并写回自己的数据（缺失时纸面区块会隐藏）',
  connector: '注册外部连接器（需要桌面桥，默认关闭）',
  ocr: '使用 OCR 能力（P4 接入，本阶段没有实现）',
  ai: '使用 AI 能力（P8 接入，本阶段没有网络代码）',
  network: '联网（本阶段宿主一律拒绝）',
};

/** 这个权限在用户语言里的一句话；未知权限原样返回，方便排错。 */
export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission as PluginPermission] ?? permission;
}

/** 权限列表里是否存在宿主不认识的项（安装页要提示，而不是静默忽略）。 */
export function unknownPermissions(permissions: readonly string[]): string[] {
  return permissions.filter(
    (permission) => !PLUGIN_PERMISSIONS.includes(permission as PluginPermission),
  );
}
