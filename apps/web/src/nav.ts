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
  | 'friends'
  | 'cloud'
  | 'mind';

export interface NavItem {
  id: ScreenId;
  title: string;
  /** 实现状态：false 时点击显示"阶段 Pn，尚未开始"。 */
  ready: boolean;
}

export interface NavGroup {
  /** 模块编码，例如 'P1·M1'。 */
  code: string;
  /** 阶段，用于给未实现的条目加前缀。 */
  stage: 'P1' | 'P2';
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    code: 'P1·M1',
    stage: 'P1',
    title: '工具',
    items: [
      { id: 'pomodoro', title: '番茄钟', ready: false },
      { id: 'notebook', title: '笔记本', ready: false },
      { id: 'board', title: '画板', ready: false },
      { id: 'deviceLock', title: '电子产品锁定', ready: false },
    ],
  },
  {
    code: 'P1·M2',
    stage: 'P1',
    title: '记录',
    items: [
      { id: 'tasks', title: '作业清单', ready: true },
      { id: 'timetable', title: '课程表', ready: false },
      { id: 'checkin', title: '每日打卡', ready: false },
      { id: 'usage', title: '使用时长', ready: false },
    ],
  },
  {
    code: 'P1·M3',
    stage: 'P1',
    title: '导出',
    items: [{ id: 'print', title: '打印 checklist', ready: true }],
  },
  {
    code: 'P2·M1',
    stage: 'P2',
    title: '好友',
    items: [{ id: 'friends', title: '好友与状态', ready: false }],
  },
  {
    code: 'P2·M2',
    stage: 'P2',
    title: '云存档',
    items: [{ id: 'cloud', title: '存档与分享', ready: false }],
  },
  {
    code: 'P2·M3',
    stage: 'P2',
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
  for (const group of NAV) {
    const item = group.items.find((entry) => entry.id === screen);
    if (item) return item.title;
  }
  return screen;
}
