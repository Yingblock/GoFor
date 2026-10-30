import type { CssContribution, ThemeContribution } from '@gofor/plugin-api';
import type { CSSProperties } from 'react';

/**
 * UI 扩展的边界（P3-3.11）。
 *
 * 三档能力都**只作用于屏幕层**，而且都在宿主这一侧过滤：
 * - 主题只允许覆盖设计系统的 token，纸面色是硬编码，插件没有路径改到纸上；
 * - CSS 由宿主包 `@media screen { @scope (...) { … } }`，插件写不出打印样式；
 * - 卸载即移除 `<style>`，不需要插件自己清理。
 *
 * 这里的 sanitize 不是安全沙箱（构建期插件本来就能改 DOM），它的作用是
 * **让"插件改到了纸面/外壳"变成一个不可能写出来的声明**，而不是事后追查。
 */

const TOKEN_PATTERN = /^--(?:color|radius|shadow|text|duration|ease|spacing|font)-[a-z0-9-]+$/;
const VALUE_PATTERN = /^[^;{}@\\<>]{1,160}$/;
const MAX_CSS_LENGTH = 20_000;
const FORBIDDEN_CSS = /@import|@charset|@namespace|<\/style|javascript:/i;

/** 只保留设计系统 token；其它变量名一律忽略（插件不能凭空造 `--x` 给宿主组件用）。 */
export function sanitizeThemeTokens(
  tokens: Readonly<Record<string, string>>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (!TOKEN_PATTERN.test(key)) continue;
    if (typeof value !== 'string' || !VALUE_PATTERN.test(value.trim())) continue;
    safe[key] = value.trim();
  }
  return safe;
}

export function themeStyle(theme: ThemeContribution | null): CSSProperties | undefined {
  if (!theme) return undefined;
  const tokens = sanitizeThemeTokens(theme.tokens);
  if (Object.keys(tokens).length === 0) return undefined;
  // CSS 自定义属性不在 React 的 CSSProperties 类型里，这里只做一次断言。
  return tokens as unknown as CSSProperties;
}

/**
 * 把插件 CSS 包进屏幕层作用域。
 *
 * `@scope` 需要 Chromium 118+；本项目主渠道是 PWA / Chromium，低版本
 * 会退化为"样式不生效"而不是泄漏到全局（@scope 语法无效时整条规则被忽略）。
 * 不支持时安装页会提示，见 PluginDirectory。
 */
export function scopePluginCss(pluginId: string, css: string): string | null {
  if (css.trim() === '' || css.length > MAX_CSS_LENGTH) return null;
  if (FORBIDDEN_CSS.test(css)) return null;
  const surface = `[data-plugin-surface="${cssEscape(pluginId)}"]`;
  return `@media screen {\n@scope (${surface}) {\n${css}\n}\n}`;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '');
}

/** 给安装页展示"这条样式会不会生效"（只做静态判断）。 */
export function describeCssContribution(contribution: CssContribution): string {
  if (FORBIDDEN_CSS.test(contribution.css)) {
    return '样式里有被禁止的指令（@import / <style> / javascript:），不会注入';
  }
  if (contribution.css.length > MAX_CSS_LENGTH) return '样式太长，不会注入';
  return '已作用域化：只在插件自己那块界面里生效（屏幕层）';
}
