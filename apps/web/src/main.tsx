import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 不存在');

createRoot(container).render(
  <StrictMode>
    <App />
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
