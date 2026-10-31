const runtime = globalThis.__GOFOR_HOST__?.jsxRuntime;

if (!runtime) throw new Error('外部插件缺少 window.__GOFOR_HOST__.jsxRuntime');

export const Fragment = runtime.Fragment;
export const jsx = runtime.jsx;
export const jsxs = runtime.jsxs;
