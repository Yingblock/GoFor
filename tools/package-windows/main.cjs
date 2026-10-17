// GoFor 的 Windows 便携壳（一次性打包实验，不属于产品架构）。
//
// 为什么用本地 HTTP 而不是 file://：Service Worker 与 IndexedDB 在 file:// 下
// 行为不一致，而 http://127.0.0.1 与生产环境同构，能直接复用同一份 dist。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));

  // 目录穿越保护
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // SPA 兜底
  if (!fs.existsSync(filePath)) filePath = path.join(ROOT, 'index.html');

  const ext = path.extname(filePath);
  response.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

app.whenReady().then(() => {
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const win = new BrowserWindow({
      width: 1180,
      height: 940,
      title: 'GoFor',
      backgroundColor: '#f7f6f2',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win.loadURL(`http://127.0.0.1:${port}/`);
  });
});

app.on('window-all-closed', () => app.quit());
