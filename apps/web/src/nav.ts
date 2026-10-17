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
  | 'friends'
  | 'cloud'
  | 'mind';

export interface NavItem {
  id: ScreenId;
  title: string;
  /** 实现状态：false 时点击显示"阶段 Pn，尚未开始"。 */
  ready: boolean;
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
      { id: 'pomodoro', title: '番茄钟', ready: true },
      { id: 'notebook', title: '笔记本', ready: false },
      { id: 'board', title: '画板', ready: false },
      { id: 'deviceLock', title: '电子产品锁定', ready: false },
    ],
  },
  {
    code: '离线·M2',
    part: 'offline',
    title: '记录',
    items: [
      { id: 'tasks', title: '作业清单', ready: true },
      { id: 'timetable', title: '课程表', ready: true },
      { id: 'checkin', title: '每日打卡', ready: true },
      { id: 'usage', title: '使用时长', ready: false },
    ],
  },
  {
    code: '离线·M3',
    part: 'offline',
    title: '导出',
    items: [
      { id: 'print', title: '打印 checklist', ready: true },
      { id: 'templates', title: '模板与校准页', ready: true },
    ],
  },
  {
    code: '在线·M1',
    part: 'online',
    title: '好友',
    items: [{ id: 'friends', title: '好友与状态', ready: false }],
  },
  {
    code: '在线·M2',
    part: 'online',
    title: '云存档',
    items: [{ id: 'cloud', title: '存档与分享', ready: false }],
  },
  {
    code: '在线·M3',
    part: 'online',
    title: '心理支持',
    items: [{ id: 'mind', title: '自助工具箱', ready: false }],
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
