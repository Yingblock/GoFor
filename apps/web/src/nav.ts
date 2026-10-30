/**
 * 信息架构：模块编码就是导航结构。
 *
 * 直接沿用用户最初给的编号（P1/P2 × M1/M2/M3），不另发明一套。
 * 见 docs/DESIGN.md §2。
 *
 * P3 起，导航不再是一个写死的数组：`CORE_NAV` 只是**内核页面**，
 * 插件贡献的页面通过 `buildNav(pluginScreens)` 插进对应分组。
 * 插件被禁用/卸载时，条目自然消失（不用在这里加开关）。
 */

/** 内核页面 id。插件页面是 `<pluginId>/<screenId>`，永远不在这份 union 里。 */
export type ScreenId =
  | 'home'
  /** 拍照录入：首页顶部的入口，不属于任何分组。 */
  | 'capture'
  | 'pomodoro'
  | 'notebook'
  | 'board'
  | 'deviceLock'
  | 'tasks'
  | 'timetable'
  | 'checkin'
  | 'usage'
  | 'print'
  | 'templates'
  /** 数据与备份：导出/导入、存储状态。 */
  | 'data'
  /** P2：扫描回填（纸的回流）。 */
  | 'scan'
  /** P3：插件目录（安装/禁用/权限/数据契约）。 */
  | 'plugins'
  | 'friends'
  | 'cloud';

export interface NavItem {
  /** 内核 ScreenId 或插件页面 id（`<pluginId>/<screenId>`）。 */
  id: string;
  title: string;
  /** 实现状态：false 时点击显示"阶段 Pn，尚未开始"。 */
  ready: boolean;
  /**
   * 折叠态侧栏里显示的图标（emoji）。
   *
   * 不引入图标库：一个 emoji 就够 56px 宽的列用，而且没有额外依赖/打包体。
   * 可选是为了不让"加条目"必须同时想图标。
   */
  icon?: string;
  /** 来自哪个插件；内核页面没有这个字段。 */
  pluginId?: string;
  /** 分组内排序，小的在前；缺省排最后。 */
  order?: number;
}

/**
 * 产品部分。
 *
 * 注意：这**不是**开发阶段。开发阶段用 P0–P8（见 ROADMAP），
 * 产品部分只有两个：离线 / 在线。早期两者都用 P1/P2，导致"P1·M1"
 * 到底是"阶段1模块1"还是"产品第1部分模块1"完全分不清。
 */
export type ProductPart = 'offline' | 'online';

export interface NavGroup {
  /** 模块编码，例如 '离线·M1'。 */
  code: string;
  part: ProductPart;
  title: string;
  items: NavItem[];
}

/** 内核页面。插件页面不写在这里。 */
export const CORE_NAV: NavGroup[] = [
  {
    code: '离线·M1',
    part: 'offline',
    title: '工具',
    items: [
      { id: 'notebook', title: '笔记本', ready: false, icon: '📓', order: 40 },
      { id: 'board', title: '画板', ready: false, icon: '🎨', order: 50 },
      { id: 'deviceLock', title: '电子产品锁定', ready: false, icon: '🔒', order: 60 },
    ],
  },
  {
    code: '离线·M2',
    part: 'offline',
    title: '记录',
    items: [{ id: 'usage', title: '使用时长', ready: false, icon: '⏱️', order: 90 }],
  },
  {
    code: '离线·M3',
    part: 'offline',
    title: '导出',
    items: [
      { id: 'print', title: '打印 checklist', ready: true, icon: '🖨️', order: 10 },
      { id: 'templates', title: '模板与校准页', ready: true, icon: '📐', order: 20 },
      { id: 'data', title: '数据与备份', ready: true, icon: '💾', order: 30 },
      { id: 'plugins', title: '插件与扩展', ready: true, icon: '🧩', order: 40 },
    ],
  },
  {
    code: '在线·M1',
    part: 'online',
    title: '好友',
    items: [{ id: 'friends', title: '好友与状态', ready: false, icon: '👥', order: 10 }],
  },
  {
    code: '在线·M2',
    part: 'online',
    title: '云存档',
    items: [{ id: 'cloud', title: '存档与分享', ready: false, icon: '☁️', order: 10 }],
  },
  {
    code: '在线·M3',
    part: 'online',
    title: '心理支持',
    items: [],
  },
];

/** 插件页面的最小信息（宿主注册表提供）。 */
export interface PluginScreenSummary {
  id: string;
  title: string;
  group: string;
  icon?: string;
  order?: number;
  pluginId: string;
}

const PLUGIN_GROUP_CODE = '插件';
const PLUGIN_GROUP: NavGroup = {
  code: PLUGIN_GROUP_CODE,
  part: 'offline',
  title: '插件',
  items: [],
};

/**
 * 内核导航 + 插件页面。
 *
 * 只做插入，最后按 `order` 排序；缺省排最后（插件内部顺序不依赖注册先后），
 * 这样同一份插件集合每次渲染得到同一份导航。
 */
export function buildNav(pluginScreens: readonly PluginScreenSummary[]): NavGroup[] {
  const groups: NavGroup[] = CORE_NAV.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }));

  for (const screen of pluginScreens) {
    const item: NavItem = {
      id: screen.id,
      title: screen.title,
      ready: true,
      pluginId: screen.pluginId,
      ...(screen.icon === undefined ? {} : { icon: screen.icon }),
      ...(screen.order === undefined ? {} : { order: screen.order }),
    };
    const group = groups.find((candidate) => candidate.code === screen.group);
    if (group) {
      group.items.push(item);
      continue;
    }
    let pluginGroup = groups.find((candidate) => candidate.code === PLUGIN_GROUP_CODE);
    if (!pluginGroup) {
      pluginGroup = { ...PLUGIN_GROUP, items: [] };
      groups.push(pluginGroup);
    }
    pluginGroup.items.push(item);
  }

  // 组内排序：内核条目也有 order；缺省排最后，保持相同 order 的原插入顺序。
  for (const group of groups) {
    group.items = group.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.order ?? 1000) - (b.item.order ?? 1000) || a.index - b.index)
      .map(({ item }) => item);
  }

  return groups;
}

/** 在给定导航里找到某个 screen 所属的分组编码。 */
export function groupOf(groups: readonly NavGroup[], screen: string): string | undefined {
  return groups.find((group) => group.items.some((item) => item.id === screen))?.code;
}

/** 在给定导航里找到某个 screen 的标题。 */
export function titleOf(groups: readonly NavGroup[], screen: string): string {
  if (screen === 'home') return '首页';
  if (screen === 'capture') return '拍照录入';
  for (const group of groups) {
    const item = group.items.find((entry) => entry.id === screen);
    if (item) return item.title;
  }
  return screen;
}

/** 把导航摊平成条目表（命令面板、路由校验都用它）。 */
export function flattenNav(groups: readonly NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}
