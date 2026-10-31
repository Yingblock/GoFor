import * as React from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

declare global {
  interface Window {
    /** 外部插件 renderer 的 React 句柄；避免每个插件重复打包一份 React。 */
    __GOFOR_HOST__?: {
      React: typeof React;
      jsxRuntime: { Fragment: typeof Fragment; jsx: typeof jsx; jsxs: typeof jsxs };
    };
  }
}

if (typeof window !== 'undefined') {
  window.__GOFOR_HOST__ = { React, jsxRuntime: { Fragment, jsx, jsxs } };
}
