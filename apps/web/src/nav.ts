/**
 * 信息架构：模块编码就是导航结构。
 *
 * 直接沿用用户最初给的编号（P1/P2 × M1/M2/M3），不另发明一套。
 * 见 docs/DESIGN.md §13。
 */

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
  | 'mood'
  | 'report'
  | 'checklist'
  | 'diary'
  | 'friends'
  | 'cloud'
  | 'mind';

export interface NavItem {
  id: ScreenId;
  title: string;
  /** 实现状态：false 时点击显示"阶段 Pn，尚未开始"。 */
  ready: boolean;
  /**
   * 折叠态侧栏里显示的图标（emoji）。
   *
   * 不引入图标库：一个 emoji 就够 56px 宽的图标列用，而且没有额外依赖/打包体。
   * 可选是为了不让"加条目"必须同时想图标。
   */
  icon?: string;
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

export const NAV: NavGroup[] = [
  {
    code: '离线·M1',
    part: 'offline',
    title: '工具',
    items: [
      { id: 'pomodoro', title: '番茄钟', ready: true, icon: '🍅' },
      { id: 'notebook', title: '笔记本', ready: false, icon: '📓' },
      { id: 'board', title: '画板', ready: false, icon: '🎨' },
      { id: 'deviceLock', title: '电子产品锁定', ready: false, icon: '🔒' },
      { id: 'checklist', title: '环境清单', ready: true, icon: '🧹' },
    ],
  },
  {
    code: '离线·M2',
    part: 'offline',
    title: '记录',
    items: [
      { id: 'tasks', title: '作业清单', ready: true, icon: '📋' },
      { id: 'timetable', title: '课程表', ready: true, icon: '🗓️' },
      { id: 'checkin', title: '每日打卡', ready: true, icon: '✅' },
      { id: 'usage', title: '使用时长', ready: false, icon: '⏱️' },
      { id: 'scan', title: '扫描回填', ready: true, icon: '📸' },
      { id: 'mood', title: '三格自评', ready: true, icon: '🌡️' },
      { id: 'report', title: '自我周报', ready: true, icon: '📊' },
    ],
  },
  {
    code: '离线·M3',
    part: 'offline',
    title: '导出',
    items: [
      { id: 'print', title: '打印 checklist', ready: true, icon: '🖨️' },
      { id: 'templates', title: '模板与校准页', ready: true, icon: '📐' },
      { id: 'data', title: '数据与备份', ready: true, icon: '💾' },
    ],
  },
  {
    code: '在线·M1',
    part: 'online',
    title: '好友',
    items: [{ id: 'friends', title: '好友与状态', ready: false, icon: '👥' }],
  },
  {
    code: '在线·M2',
    part: 'online',
    title: '云存档',
    items: [{ id: 'cloud', title: '存档与分享', ready: false, icon: '☁️' }],
  },
  {
    code: '在线·M3',
    part: 'online',
    title: '心理支持',
    items: [
      { id: 'mind', title: '自助工具箱', ready: true, icon: '🧠' },
      { id: 'diary', title: '情绪日记', ready: true, icon: '📖' },
    ],
  },
];

/** 找到某个 screen 所属的分组编码。 */
export function groupOf(screen: ScreenId): string | undefined {
  return NAV.find((group) => group.items.some((item) => item.id === screen))?.code;
}

/** 找到某个 screen 的标题。 */
export function titleOf(screen: ScreenId): string {
  if (screen === 'home') return '首页';
  if (screen === 'capture') return '拍照录入';
  if (screen === 'templates') return '模板与校准页';
  for (const group of NAV) {
    const item = group.items.find((entry) => entry.id === screen);
    if (item) return item.title;
  }
  return screen;
}
