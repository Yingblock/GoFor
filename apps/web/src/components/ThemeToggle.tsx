import { useState } from 'react';
import {
  nextThemeMode,
  readThemeMode,
  setThemeMode,
  type ThemeMode,
  themeModeLabel,
} from '../theme.ts';

/**
 * 主题切换（P2-2.16）：跟随系统 → 浅色 → 深色 循环。
 *
 * 为什么放在侧栏底部：主题是"调试/夜间"偏好，不该占主行动的位置；
 * 同时它需要随时可点，折叠态只留图标也必须够得着。
 */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>(() => readThemeMode());
  const label = `主题：${themeModeLabel(mode)}（点击切换）`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = nextThemeMode(mode);
        setMode(next);
        setThemeMode(next);
      }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption text-ink/60 transition-colors duration-fast hover:bg-ink/[0.05] hover:text-ink"
    >
      <span aria-hidden>{mode === 'dark' ? '🌙' : mode === 'light' ? '☀️' : '🌗'}</span>
      <span className={collapsed ? 'md:hidden' : ''}>{themeModeLabel(mode)}</span>
    </button>
  );
}
