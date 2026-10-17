import { systemClock } from '@gofor/core';

/**
 * P0 占位壳。
 * 这里只证明「共享包 + Tailwind + React」三件事已经打通，
 * 不含任何业务功能。P0 完成后会被真实布局替换。
 */
export function App() {
  const bootedAt = new Date(systemClock.now()).toLocaleString('zh-CN');

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <header>
        <h1 className="font-semibold text-4xl tracking-tight">GoFor</h1>
        <p className="mt-2 text-lg opacity-60">离线优先的学习辅助工具</p>
      </header>

      <section className="rounded-xl border border-black/10 bg-white/60 p-5">
        <h2 className="font-medium text-sm opacity-50">P0 地基</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>✅ pnpm workspace 多包结构</li>
          <li>✅ TypeScript strict</li>
          <li>✅ React + Vite + Tailwind</li>
          <li>✅ 共享包 @gofor/core 可被引用（Clock 注入就绪）</li>
          <li>⬜ Dexie 数据层</li>
          <li>⬜ PWA 可安装</li>
          <li>⬜ 命令面板</li>
        </ul>
      </section>

      <p className="text-xs opacity-40">本次启动于 {bootedAt}</p>
    </main>
  );
}
