import * as React from 'react';

declare global {
  interface Window {
    /** 外部插件 renderer 的 React 句柄；避免每个插件重复打包一份 React。 */
    __GOFOR_HOST__?: { React: typeof React };
  }
}

if (typeof window !== 'undefined') {
  window.__GOFOR_HOST__ = { React };
}
