import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

/**
 * 主题 token 包 + 作用域 CSS（P3-3.11 的档 1 与档 3）。
 *
 * 只覆盖屏幕层的 `--color-*`。纸面（`.print-page`）是硬编码白底黑字，
 * 所以启用它之后 `e2e/out/day-sheet.pdf` 的体积与颜色必须完全不变。
 */
export const sepiaThemePlugin: PluginModule = {
  manifest: {
    id: 'gofor.theme.sepia',
    name: '护眼主题',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '把屏幕层换成暖色纸感；打印纸面不受影响。',
    author: 'GoFor',
    permissions: ['ui.theme', 'ui.slot', 'ui.css'],
    provides: { themes: ['gofor.theme.sepia/theme'] },
  },
  activate(context) {
    context.registerTheme({
      id: 'gofor.theme.sepia/theme',
      name: '护眼（暖纸）',
      tokens: {
        '--color-paper': '#f4ecdc',
        '--color-card': '#fffaf0',
        '--color-card-soft': 'rgba(255, 250, 240, 0.72)',
        '--color-card-faint': 'rgba(255, 250, 240, 0.5)',
        '--color-ink': '#33281d',
        '--color-accent': '#8a5a2b',
        '--color-line': 'rgba(51, 40, 29, 0.12)',
        '--color-line-strong': 'rgba(51, 40, 29, 0.28)',
      },
    });

    // 页头右侧的标记：让用户一眼看出"现在有主题包生效"。
    context.registerSlot({
      id: 'gofor.theme.sepia/badge',
      slot: 'app.header.right',
      order: 10,
      load: async () => {
        const module = await import('./ThemeBadge.tsx');
        return { default: module.ThemeBadge };
      },
    });

    context.registerCss({
      id: 'gofor.theme.sepia/badge-style',
      css: '.plugin-theme-badge { border-color: var(--color-accent); color: var(--color-accent); }',
    });
  },
};
