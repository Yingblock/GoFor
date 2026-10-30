import { formatScreenHash, parseScreenHash } from '@gofor/core/plugin';
import { useCallback, useEffect, useState } from 'react';

/**
 * 最小 hash 路由的浏览器外壳。
 *
 * 纯解析/格式化在 `@gofor/core/plugin`（可单测），这里只负责：
 * - 启动时把空 hash 补成 `#/s/home`（用 replaceState，不制造多余历史）；
 * - 监听 `hashchange`（后退/前进/手改地址都能收到）；
 * - `navigate` 直接改 `location.hash`，刷新与深链天然可用。
 *
 * 为什么不用 react-router：只需要三件事，见 DECISIONS/0004。
 */
export function readScreenId(): string {
  return parseScreenHash(window.location.hash) ?? 'home';
}

export interface ScreenRoute {
  screen: string;
  navigate: (screenId: string) => void;
}

export function useScreenRoute(): ScreenRoute {
  const [screen, setScreen] = useState(readScreenId);

  useEffect(() => {
    if (parseScreenHash(window.location.hash) === null) {
      window.history.replaceState(null, '', formatScreenHash('home'));
      setScreen('home');
    }
    const onChange = () => setScreen(readScreenId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((screenId: string) => {
    const hash = formatScreenHash(screenId);
    setScreen(screenId);
    if (window.location.hash === hash) return;
    // 赋值给 location.hash 会压入一条历史记录：后退键因此天然可用。
    window.location.hash = hash;
  }, []);

  return { screen, navigate };
}
