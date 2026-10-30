import { IconButton } from '@gofor/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { groupOf, type NavGroup } from '../nav.ts';
import { DebugPanel } from './DebugPanel.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

export interface SidebarProps {
  screen: string;
  /** 内核导航 + 插件贡献的页面（宿主注册表算好后传进来）。 */
  groups: NavGroup[];
  onNavigate: (screen: string) => void;
  open: boolean;
  onClose: () => void;
  /**
   * 桌面端折叠态：只留一列图标。
   *
   * 只在 ≥768px 生效——窄屏是抽屉，抽屉里永远是完整文字版（DESIGN §2 规则 5）。
   */
  collapsed: boolean;
  /** 插件在侧栏底部的命名插槽（`app.sidebar.footer`）。 */
  footerSlot?: ReactNode;
}

/**
 * 左侧垂直工具栏。
 *
 * 交互按用户规定：点击分组标题展开该模块的条目（手风琴），点条目切页。
 * 未进入阶段的条目仍然显示但置灰——让用户看到全貌，而不是隐藏。
 *
 * 折叠态（桌面 ≥768px）：手风琴整个换成「分组间加分隔线的图标列」。
 * 折叠时不再有展开/收起分组的概念——所有条目平铺成一列，每个都点得到，
 * 悬停有 `title`、聚焦有 `aria-label` 报出名字。
 */
export function Sidebar({
  screen,
  groups,
  onNavigate,
  open,
  onClose,
  collapsed,
  footerSlot,
}: SidebarProps) {
  const activeGroup = groupOf(groups, screen) ?? groups[1]?.code ?? null;
  const [expanded, setExpanded] = useState<string | null>(activeGroup);
  /**
   * 分组结构指纹，而不是 `groups` 数组本身。
   *
   * 宿主每次渲染都会重建 `groups`（`buildNav` 不是 memo 的）；如果 effect 依赖
   * `groups`，用户点开的分组会在下一次宿主渲染时被立刻收回，表现就是「点不开」。
   * 只在页面切换或插件增删导致分组变化时重置。
   */
  const groupSignature = groups.map((group) => group.code).join('|');

  // biome-ignore lint/correctness/useExhaustiveDependencies: groups 每次渲染都是新数组，依赖 groupSignature 才稳定
  useEffect(() => {
    const group = groupOf(groups, screen);
    if (group) setExpanded(group);
  }, [screen, groupSignature]);

  const go = (next: string) => {
    onNavigate(next);
    onClose();
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-scrim md:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-line bg-paper transition-transform duration-base ease-standard md:sticky md:top-0 md:bottom-auto md:z-20 md:h-screen md:self-start md:translate-x-0 ${
          collapsed ? 'md:w-14' : 'md:w-60'
        } ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div
          className={`flex items-center justify-between px-4 py-4 ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="GoFor"
            aria-current={screen === 'home' ? 'page' : undefined}
            title="GoFor · 首页"
            className="text-left text-title font-semibold tracking-tight"
          >
            <span className={collapsed ? 'md:hidden' : ''}>GoFor</span>
            {/* 折叠态：品牌名让位给「首页」图标，否则 56px 一列放不下文字 */}
            <span aria-hidden className={collapsed ? 'hidden md:inline' : 'hidden'}>
              🏠
            </span>
          </button>
          <IconButton aria-label="关闭菜单" size="sm" onClick={onClose} className="md:hidden">
            ✕
          </IconButton>
        </div>

        <nav className="flex-1 overflow-y-auto pb-6">
          {/* 展开态：手风琴。窄屏永远走这一份（`md:hidden` 只在桌面折叠时生效）。 */}
          <div className={collapsed ? 'md:hidden' : ''}>
            {groups.map((group) => {
              const isOpen = expanded === group.code;
              return (
                <div key={group.code} className="border-t border-line">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : group.code)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors duration-fast hover:bg-ink/[0.03]"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-micro tracking-tight opacity-40">
                        {group.code}
                      </span>
                      <span className="text-body">{group.title}</span>
                    </span>
                    <span className="text-micro opacity-30">{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {isOpen ? (
                    <ul className="pb-1.5">
                      {group.items.map((item) => {
                        const isActive = item.id === screen;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => go(item.id)}
                              aria-current={isActive ? 'page' : undefined}
                              className={`flex w-full items-center gap-2 py-1.5 pr-4 pl-8 text-left text-body transition-colors duration-fast ${
                                isActive
                                  ? 'bg-ink/[0.06] font-medium'
                                  : item.ready
                                    ? 'hover:bg-ink/[0.03]'
                                    : 'opacity-40 hover:bg-ink/[0.03]'
                              }`}
                            >
                              {item.title}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* 折叠态（仅桌面）：所有条目平铺成图标列，分组之间用分隔线分组。 */}
          <div className={collapsed ? 'hidden md:block' : 'hidden'}>
            {groups.map((group) => (
              <div key={group.code} className="border-t border-line py-1 first:border-t-0">
                {group.items.map((item) => {
                  const isActive = item.id === screen;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      aria-label={item.title}
                      aria-current={isActive ? 'page' : undefined}
                      title={`${item.title} · ${group.code}`}
                      className={`flex h-9 w-full items-center justify-center text-base transition-colors duration-fast ${
                        isActive
                          ? 'bg-ink/[0.06]'
                          : item.ready
                            ? 'hover:bg-ink/[0.04]'
                            : 'opacity-40 hover:bg-ink/[0.03]'
                      }`}
                    >
                      <span aria-hidden>{item.icon ?? '•'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {footerSlot ? (
          <div className={`border-t border-line px-3 py-2 ${collapsed ? 'md:hidden' : ''}`}>
            {footerSlot}
          </div>
        ) : null}

        {/* 主题切换：折叠态只留图标，随时够得着。 */}
        <div className="border-t border-line px-3 py-2">
          <ThemeToggle collapsed={collapsed} />
        </div>

        {/* 折叠后 56px 放不下这些文字；它们不是导航功能，桌面折叠时收起来。 */}
        <div
          className={`border-t border-line px-4 py-3 text-micro leading-relaxed opacity-35 ${
            collapsed ? 'md:hidden' : ''
          }`}
        >
          P1 离线 · P2 在线
        </div>

        {/* TODO(debug-clock): 上线前删除（调试时钟入口）。 */}
        <div className={`border-t border-line px-3 pt-2 pb-3 ${collapsed ? 'md:hidden' : ''}`}>
          <DebugPanel />
        </div>
      </aside>
    </>
  );
}
