// GoFor 的 Windows 便携壳（一次性打包实验，不属于产品架构）。
//
// 为什么用本地 HTTP 而不是 file://：Service Worker 与 IndexedDB 在 file:// 下
// 行为不一致，而 http://127.0.0.1 与生产环境同构，能直接复用同一份 dist。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');

const ROOT = path.join(__dirname, 'dist');

/**
 * 固定端口，不能让系统随机分配。
 *
 * 为什么：IndexedDB / localStorage 是**按 origin 隔离**的，origin 里带端口。
 * 以前用 `listen(0)`，每次启动端口都变，等于每次都换了一个空数据库——
 * 用户看到的就是「关掉窗口后内容全丢了」。数据其实还在旧 origin 下，只是再也打不开。
 * 固定端口之后 origin 恒为 `http://127.0.0.1:47821`，数据才会一直跟着走。
 */
const PORT = 47821;

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

// 只允许一个实例：两个实例抢同一个端口，第二个会直接报错，用户会以为程序坏了。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  start();
}

function start() {
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      dialog.showErrorBox(
        'GoFor 已经在运行',
        '已经有一个 GoFor 窗口打开了。请回到那个窗口，或先关掉它再启动。\n\n' +
          '（同一时间只能开一个：数据存在这个固定地址下，两个实例会互相覆盖。）',
      );
      app.quit();
      return;
    }
    throw error;
  });

  app.whenReady().then(() => {
    server.listen(PORT, '127.0.0.1', () => {
      const win = new BrowserWindow({
        width: 1180,
        height: 940,
        title: 'GoFor',
        backgroundColor: '#f7f6f2',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      win.loadURL(`http://127.0.0.1:${PORT}/`);
    });
  });
}

app.on('window-all-closed', () => app.quit());
