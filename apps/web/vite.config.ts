import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /**
     * 本地 4173 会反复构建。旧页面可能还持有上一版的懒加载 chunk URL；
     * 若每次构建清空 dist，启用一个之前禁用的插件就会请求已删除的 chunk，
     * 报 `Failed to fetch dynamically imported module`（刷新才恢复）。
     * 保留旧 assets 一个宽限期；需要干净产物时手动 `rm -rf dist`。
     */
    emptyOutDir: false,
  },
  server: {
    // 允许手机在同一局域网访问开发服务器（P0 验收需要）
    host: true,
    port: 5173,
  },
});
