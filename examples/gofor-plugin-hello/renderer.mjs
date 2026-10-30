// 渲染进程入口：主进程通过 IPC 只给 { slotId, renderer, componentName }，
// 渲染进程按 gofor-plugin://<包名>/renderer.mjs 动态 import 这个文件。
//
// 真实插件在这里返回 React 组件；示例保持零依赖，导出同名函数即可。
export function HelloSlot(props = { pluginId: 'gofor-plugin-hello' }) {
  return `Hello from ${props.pluginId}`;
}
