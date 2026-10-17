import { useEffect, useState } from 'react';
import { groupOf, NAV, type ScreenId } from '../nav.ts';
import { DebugPanel } from './DebugPanel.tsx';

export interface SidebarProps {
  screen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  open: boolean;
  onClose: () => void;
  /**
   * 桌面端折叠态：只留一列图标。
   *
   * 只在 ≥768px 生效——窄屏是抽屉，抽屉里永远是完整文字版（DESIGN §13.2 规则 6）。
   */
  collapsed: boolean;
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
export function Sidebar({ screen, onNavigate, open, onClose, collapsed }: SidebarProps) {
  const activeGroup = groupOf(screen) ?? NAV[1]?.code ?? null;
  const [expanded, setExpanded] = useState<string | null>(activeGroup);

  // 切页时自动展开所在分组，避免"当前页在折叠的分组里"
  useEffect(() => {
    const group = groupOf(screen);
    if (group) setExpanded(group);
  }, [screen]);

  const go = (next: ScreenId) => {
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
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-black/[0.08] bg-[var(--color-paper)] transition-transform md:static md:z-auto md:translate-x-0 ${
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
            className="text-left text-lg font-semibold tracking-tight"
          >
            <span className={collapsed ? 'md:hidden' : ''}>GoFor</span>
            {/* 折叠态：品牌名让位给「首页」图标，否则 56px 一列放不下文字 */}
            <span aria-hidden className={collapsed ? 'hidden md:inline' : 'hidden'}>
              🏠
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs opacity-50 md:hidden"
            aria-label="关闭菜单"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto pb-6">
          {/* 展开态：手风琴。窄屏永远走这一份（`md:hidden` 只在桌面折叠时生效）。 */}
          <div className={collapsed ? 'md:hidden' : ''}>
            {NAV.map((group) => {
              const isOpen = expanded === group.code;
              return (
                <div key={group.code} className="border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : group.code)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] tracking-tight opacity-40">
                        {group.code}
                      </span>
                      <span className="text-sm">{group.title}</span>
                    </span>
                    <span className="text-[10px] opacity-30">{isOpen ? '▾' : '▸'}</span>
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
                              className={`flex w-full items-center gap-2 py-1.5 pr-4 pl-8 text-left text-[13px] ${
                                isActive
                                  ? 'bg-black/[0.06] font-medium'
                                  : item.ready
                                    ? 'hover:bg-black/[0.03]'
                                    : 'opacity-40 hover:bg-black/[0.03]'
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
            {NAV.map((group) => (
              <div key={group.code} className="border-t border-black/[0.06] py-1 first:border-t-0">
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
                      className={`flex h-9 w-full items-center justify-center text-base ${
                        isActive
                          ? 'bg-black/[0.06]'
                          : item.ready
                            ? 'hover:bg-black/[0.04]'
                            : 'opacity-40 hover:bg-black/[0.03]'
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

        {/* 折叠后 56px 放不下这些文字；它们不是导航功能，桌面折叠时收起来。 */}
        <div
          className={`border-t border-black/[0.08] px-4 py-3 text-[10px] leading-relaxed opacity-35 ${
            collapsed ? 'md:hidden' : ''
          }`}
        >
          P1 离线 · P2 在线
        </div>

        {/* TODO(debug-clock): 上线前删除（调试时钟入口）。 */}
        <div
          className={`border-t border-black/[0.08] px-3 pt-2 pb-3 ${collapsed ? 'md:hidden' : ''}`}
        >
          <DebugPanel />
        </div>
      </aside>
    </>
  );
}
