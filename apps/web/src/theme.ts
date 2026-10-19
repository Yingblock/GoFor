/**
 * 主题（P2-2.16）：跟随系统 / 强制浅色 / 强制深色。
 *
 * 为什么不用 `prefers-color-scheme` 单干：晚上调试需要**手动**切深色，
 * 而白天可能系统开着深色、看纸面预览却想要浅色。所以三态，默认跟随系统。
 *
 * 实现只做一件事：把解析后的 `light|dark` 写到 `<html data-theme>`；
 * 颜色本身全在 `styles.css` 的 token 里，组件不感知主题。
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'gofor.ui.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 存储不可用（隐私模式）时按跟随系统处理，不影响启动。 */
export function readThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function writeAttribute(theme: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** 应用主题；只改 data-theme，不动组件。 */
export function applyTheme(mode: ThemeMode): void {
  writeAttribute(resolveTheme(mode));
}

/** 启动时调用；跟随系统时监听系统切换。 */
export function initTheme(): void {
  applyTheme(readThemeMode());
  const media = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (readThemeMode() === 'system') applyTheme('system');
  };
  media.addEventListener('change', onChange);
}

/** 用户手动选择：存下来并立刻应用。 */
export function setThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 存不下也要让这一次切换生效。
  }
  applyTheme(mode);
}

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_MODES.indexOf(mode);
  return THEME_MODES[(index + 1) % THEME_MODES.length] ?? 'system';
}

export function themeModeLabel(mode: ThemeMode): string {
  if (mode === 'light') return '浅色';
  if (mode === 'dark') return '深色';
  return '跟随系统';
}
