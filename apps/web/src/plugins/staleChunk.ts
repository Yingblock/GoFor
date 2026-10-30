/**
 * 页面打开期间 dist 被重新构建后，旧页面里的懒加载 chunk URL 会失效。
 * Vite preview / 静态壳对缺失资源的 SPA 回退会返回 index.html（200 + text/html），
 * 动态 import 因此报 `Failed to fetch dynamically imported module`。
 *
 * 这不是插件逻辑错误：刷新一次拿到新 index + 新 chunk 就恢复。这里把它收敛成
 * 「自动刷新一次；还失败就给出明确文案」，避免用户看到吓人的加载失败。
 */

const RELOAD_KEY_PREFIX = 'gofor.staleChunkReload:';

/** 当前页面入口脚本的 URL；构建产物换 hash 后它也会变。 */
function buildKey(): string {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return script?.src ?? 'unknown';
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isStaleChunkError(error: unknown): boolean {
  const message = errorText(error);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Expected a JavaScript-or-Wasm module script') ||
    message.includes('error loading dynamically imported module')
  );
}

/**
 * 同一个构建只自动刷新一次；刷新后新 index 的入口 hash 变了，键也跟着变，
 * 不会因为一次真实缺 chunk 而无限刷新。storage 不可用时直接放弃，交给 UI 提示。
 */
export function reloadOnceForStaleChunk(): boolean {
  let key: string;
  try {
    key = `${RELOAD_KEY_PREFIX}${buildKey()}`;
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
