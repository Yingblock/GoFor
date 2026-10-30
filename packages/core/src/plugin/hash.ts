/**
 * 最小 hash 路由（纯字符串函数）。
 *
 * 只做三件事：刷新保持、后退有效、深链可达。**不引 react-router**
 * （`docs/STANDARD.md` 规则 10：平台能力够用就别加依赖），也不做嵌套路由/参数。
 *
 * 路由格式：`#/s/<screenId>`。插件页面 id 是 `<pluginId>/<screenId>`，
 * 里面本来就有 `/`，所以解析时取 `#/s/` 之后的**整段**再 decode，
 * 不能再按 `/` 切第二刀。
 */

export const SCREEN_HASH_PREFIX = '#/s/';

export function formatScreenHash(screenId: string): string {
  const normalized = screenId.trim();
  // 只编码片段，保留 `/`：插件页 id 是 `<pluginId>/<screenId>`，
  // 可读的深链（`#/s/gofor.wordbook/screen`）比 `%2F` 更适合贴进地址栏。
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${SCREEN_HASH_PREFIX}${encoded}`;
}

/** 解析 hash；不是 `#/s/...` 或内容为空时返回 null（宿主退回首页）。 */
export function parseScreenHash(hash: string): string | null {
  const trimmed = hash.trim();
  if (!trimmed.startsWith(SCREEN_HASH_PREFIX)) return null;
  const raw = trimmed.slice(SCREEN_HASH_PREFIX.length);
  if (raw === '') return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded === '' ? null : decoded;
  } catch {
    // 非法百分号编码：不能把坏字符串当页面 id 用，交给首页兜底。
    return null;
  }
}

/** `<pluginId>/<screenId>`；两边都非空才算插件页面。 */
export function splitPluginScreenId(
  screenId: string,
): { pluginId: string; screenId: string } | null {
  const index = screenId.indexOf('/');
  if (index <= 0 || index === screenId.length - 1) return null;
  const pluginId = screenId.slice(0, index);
  const local = screenId.slice(index + 1);
  if (pluginId === '' || local === '') return null;
  return { pluginId, screenId: local };
}

export function isPluginScreenId(screenId: string): boolean {
  return splitPluginScreenId(screenId) !== null;
}

/** 插件页面的 id 必须带自己的命名空间，避免撞上 core 的 ScreenId union。 */
export function qualifyScreenId(pluginId: string, screenId: string): string {
  return `${pluginId}/${screenId}`;
}

/** 校验一个注册项 id 是否属于该插件。 */
export function isNamespacedId(pluginId: string, id: string): boolean {
  return id.startsWith(`${pluginId}/`) && id.length > pluginId.length + 1;
}
