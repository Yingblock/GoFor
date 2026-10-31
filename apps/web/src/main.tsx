import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';
import { reloadOnceForStaleChunk } from './plugins/staleChunk.ts';
import './plugins/externalGlobals.ts';
import { initTheme } from './theme.ts';

initTheme();

// 页面打开期间重新部署后，旧懒加载 chunk 会失效；自动刷新一次拿新 index。
// 组件层的 import 失败也会走同一套判断，避免重复刷新。
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadOnceForStaleChunk();
});

const container = document.getElementById('root');
if (!container) throw new Error('#root 不存在');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary title="GoFor 出错了">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// 只在生产构建里注册 Service Worker：
// 开发时 SW 会缓存 HMR 资源，导致改代码不生效，排障成本极高。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service Worker 注册失败', error);
    });
  });
}
