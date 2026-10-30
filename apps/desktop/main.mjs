// Electron 主进程：固定 origin 的静态服务 + 运行时插件加载 + gofor-plugin:// 协议。
//
// 这个文件是 ESM，Electron 28+ 支持。electron 本身不写进 package.json
// （体积大、平台相关）；用 tools/package-windows 的 Electron 运行时或单独安装。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { createElectronPluginRuntime } from '@gofor/plugin-runtime';
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { createRendererTaskStore } from './task-store.mjs';

const PORT = 47821; // 固定端口：IndexedDB 按 origin 隔离，不能随机
const WEB_DIST = process.env.GOFOR_WEB_DIST ?? join(import.meta.dirname, '..', 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gofor-plugin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function serveWeb() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    // resolve(WEB_DIST, '/') 会变成文件系统根，必须先去掉前导斜杠。
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let filePath = resolve(WEB_DIST, relativePath);
    const root = resolve(WEB_DIST);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath)) {
      // 资源缺失必须 404，不能回退到 index.html：动态 import 拿到 text/html
      // 会报 "Failed to fetch dynamically imported module"，且 SW 可能把 HTML
      // 缓存在 chunk URL 下。
      const looksLikeAsset = url.pathname.startsWith('/assets/') || extname(url.pathname) !== '';
      if (looksLikeAsset) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      filePath = join(root, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolvePromise(server));
  });
}

// 只把 userData/plugins/node_modules/<包名>/ 下的文件交给渲染进程。
// 不经过 eval，也不允许目录穿越；MIME 显式指定，ESM import 才不会被拒。
function handlePluginProtocol() {
  const pluginsRoot = resolve(app.getPath('userData'), 'plugins', 'node_modules');
  protocol.handle('gofor-plugin', async (request) => {
    try {
      const url = new URL(request.url);
      const packageName = decodeURIComponent(url.hostname);
      const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!/^gofor-plugin-[a-z0-9-]+$/.test(packageName)) {
        return new Response('bad package name', { status: 400 });
      }
      const filePath = resolve(pluginsRoot, packageName, relativePath);
      if (!filePath.startsWith(`${pluginsRoot}${sep}`)) {
        return new Response('forbidden', { status: 403 });
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return new Response('not found', { status: 404 });
      }
      const body = await readFile(filePath);
      return new Response(body, {
        headers: {
          'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        },
      });
    } catch {
      return new Response('bad request', { status: 400 });
    }
  });
}

function createWindow() {
  return new BrowserWindow({
    width: 1180,
    height: 940,
    title: 'GoFor',
    backgroundColor: '#f7f6f2',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let runtime = null;
  let quitting = false;

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app
    .whenReady()
    .then(async () => {
      try {
        await serveWeb();
      } catch (error) {
        if (error?.code === 'EADDRINUSE') {
          dialog.showErrorBox(
            'GoFor 已经在运行',
            '已经有一个 GoFor 窗口打开了。请回到那个窗口，或先关掉它再启动。',
          );
          app.quit();
          return;
        }
        throw error;
      }

      handlePluginProtocol();
      const win = createWindow();
      win.loadURL(`http://127.0.0.1:${PORT}/`);

      runtime = await createElectronPluginRuntime({
        app,
        ipcMain,
        taskStore: createRendererTaskStore(() => win),
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        'GoFor 启动失败',
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      app.quit();
    });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', (event) => {
    if (quitting || runtime === null) return;
    event.preventDefault();
    quitting = true;
    runtime.dispose().finally(() => app.quit());
  });
}
