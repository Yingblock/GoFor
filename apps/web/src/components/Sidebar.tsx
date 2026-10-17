import { useEffect, useState } from 'react';
import { groupOf, NAV, type ScreenId } from '../nav.ts';

export interface SidebarProps {
  screen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  open: boolean;
  onClose: () => void;
}

/**
 * 左侧垂直工具栏。
 *
 * 交互按用户规定：点击分组标题展开该模块的条目（手风琴），点条目切页。
 * 未进入阶段的条目仍然显示但置灰——让用户看到全貌，而不是隐藏。
 */
export function Sidebar({ screen, onNavigate, open, onClose }: SidebarProps) {
  const activeGroup = groupOf(screen) ?? 'P1·M2';
  const [expanded, setExpanded] = useState<string | null>(activeGroup);

  // 切页时自动展开所在分组，避免"当前页在折叠的分组里"
  useEffect(() => {
    const group = groupOf(screen);
    if (group) setExpanded(group);
  }, [screen]);

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
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-black/[0.08] bg-[var(--color-paper)] transition-transform md:static md:z-auto md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-left text-lg font-semibold tracking-tight"
          >
            GoFor
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
                            onClick={() => {
                              onNavigate(item.id);
                              onClose();
                            }}
                            className={`flex w-full items-center gap-2 py-1.5 pr-4 pl-8 text-left text-[13px] ${
                              isActive
                                ? 'bg-black/[0.06] font-medium'
                                : item.ready
                                  ? 'hover:bg-black/[0.03]'
                                  : 'opacity-40 hover:bg-black/[0.03]'
                            }`}
                          >
                            {item.title}
                            {item.ready ? null : (
                              <span className="font-mono text-[9px] opacity-60">{group.stage}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-black/[0.08] px-4 py-3 text-[10px] leading-relaxed opacity-35">
          P1 离线 · P2 在线
        </div>
      </aside>
    </>
  );
}
