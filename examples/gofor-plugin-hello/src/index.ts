// 插件入口必须导出 activate(api)；可选 deactivate(api)。
// 入口会被主进程 require，所以编译成 CommonJS（Electron 33 = Node 20）。
import type { GoForPluginAPI } from '@gofor/contracts';

/**
 * 主进程无法执行 React 组件，这里只登记一个可序列化的占位对象。
 * runtime 取 `displayName` 作为渲染进程里的导出名（见 gofor.renderer）。
 */
export const HelloSlot = {
  displayName: 'HelloSlot',
  text: '来自 gofor-plugin-hello 的问候',
} as const;

export function activate(api: GoForPluginAPI): void {
  api.registerCommand({
    id: 'plugin-hello/say-hello',
    title: 'Hello：打个招呼',
    handler: () => {
      console.log('[gofor-plugin-hello] hello');
    },
  });

  api.registerViewSlot('home.after-stats', HelloSlot);
}

export function deactivate(): void {
  console.log('[gofor-plugin-hello] deactivated');
}
