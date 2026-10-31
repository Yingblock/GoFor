// 插件入口必须导出 activate(api)；可选 deactivate(api)。
// 入口会被 plugin-host / Electron main require，所以编译成 CommonJS。
import type { GoForPluginAPI } from '@gofor/contracts';

/** 主进程只登记可序列化声明；renderer 里按名字导出组件/函数。 */
export function activate(api: GoForPluginAPI): void {
  api.registerCommand({
    id: 'plugin-hello/say-hello',
    title: 'Hello：打个招呼',
    handler: () => {
      console.log('[gofor-plugin-hello] hello');
    },
  });

  api.registerScreen({
    id: 'plugin-hello/screen',
    title: 'Hello 外部插件',
    group: '离线·M3',
    order: 90,
    icon: '👋',
    component: 'HelloScreen',
  });

  api.registerTheme({
    id: 'plugin-hello/theme',
    name: 'Hello 主题',
    tokens: {
      '--color-accent': 'oklch(0.58 0.16 20)',
      '--color-paper': 'oklch(0.98 0.01 30)',
    },
  });

  api.registerViewSlot('home.after-stats', 'HelloSlot');

  api.registerData({
    id: 'hello.entries',
    version: 1,
    summary: 'Hello 外部插件的示例数据',
  });

  api.registerScanHandler({
    id: 'plugin-hello/scan',
    owner: 'plugin-hello',
  });
}

export function deactivate(): void {
  console.log('[gofor-plugin-hello] deactivated');
}
