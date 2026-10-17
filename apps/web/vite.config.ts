import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 允许手机在同一局域网访问开发服务器（P0 验收需要）
    host: true,
    port: 5173,
  },
});
