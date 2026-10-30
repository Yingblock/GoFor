import type { PluginSlotProps } from '@gofor/plugin-api';

/**
 * 主题包的页头标记。
 *
 * 用 `data-plugin-surface` 把这块包起来，主题包的 CSS 才能通过
 * `@scope ([data-plugin-surface="gofor.theme.sepia"])` 命中它。
 */
export function ThemeBadge({ host }: PluginSlotProps) {
  return (
    <span data-plugin-surface="gofor.theme.sepia" className="inline-flex items-center">
      <button
        type="button"
        onClick={() => host.navigate('plugins')}
        className="plugin-theme-badge rounded-full border border-line px-2 py-0.5 text-micro opacity-70 transition-opacity duration-fast hover:opacity-100"
        data-e2e="theme-badge"
        title="护眼主题生效中，点击管理插件"
      >
        护眼主题
      </button>
    </span>
  );
}
