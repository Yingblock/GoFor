# @gofor/desktop — 运行时插件宿主（最小 Electron 主进程）

PWA 仍是正式分发形态（`DECISIONS/0002`）。这个 app 只负责**运行时插件**需要的主进程能力：

- 固定 `http://127.0.0.1:47821` 提供 `apps/web/dist`（IndexedDB 按 origin 隔离，端口不能随机）；
- `@gofor/plugin-runtime` 从 `app.getPath('userData')/plugins` 加载 `gofor-plugin-*`；
- `gofor-plugin://<包名>/<路径>` 协议，只读 `plugins/node_modules/<包名>/`，给渲染进程懒加载组件；
- 通过 preload 白名单暴露 `gofor:plugins:*` 与任务桥。

## 运行前提

`electron` 没有写进 `package.json`（体积大、平台相关；`DECISIONS/0002` 的 Electron 壳也一直如此）。
用 `tools/package-windows` 的 Electron 运行时，或在本地单独装：

```bash
pnpm --filter @gofor/plugin-runtime build
pnpm --filter @gofor/web build
cd apps/desktop && npm i -D electron@33   # 仅本地
npx electron .
# 或指定 web 产物：GOFOR_WEB_DIST=/path/to/dist npx electron .
```

没有 `apps/web/dist` 时窗口会白屏；先 `pnpm build`。

## 目录

```
main.mjs        单实例锁、静态服务、gofor-plugin://、createElectronPluginRuntime
preload.cjs     contextBridge：gofor:plugins:snapshot/reload/run-command + 任务桥
task-store.mjs  主进程 → 渲染进程的 TaskStore 请求/响应（5s 超时）
```

## 任务桥协议

主进程读不到 IndexedDB，`getTasks/updateTask` 只是转发：

```
main:    webContents.send('gofor:tasks:request', { requestId, resultChannel, kind, payload })
renderer: ipcRenderer.send(resultChannel, { ok: true, value })   // 或 { ok: false, error }
```

`kind`：`tasks:list` / `tasks:update`。渲染进程参考实现与接线步骤见
[`docs/PLUGIN-RUNTIME.md`](../../docs/PLUGIN-RUNTIME.md) §8。**本次没有改 `apps/web`，所以任务桥默认
会 5s 超时并返回明确错误**；命令/插槽/打印模板不依赖它。

## 安全

- `contextIsolation: true`、`nodeIntegration: false`；preload 只暴露三个固定频道。
- 协议拒绝包名不匹配、路径穿越、非文件；MIME 显式指定。
- 运行时插件是受信 Node 代码，`require` 即完全执行；这里没有沙箱。
