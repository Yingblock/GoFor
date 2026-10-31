# 运行时插件手册（P3.7）

> 决策：`DECISIONS/0008`。构建期 UI 插件仍按 `docs/PLUGINS.md`；本文只讲**运行时无头插件**。
> 两者不能互换：运行时 API 只有五个方法，没有页面/主题/数据契约。

## 1 两条平面

| | 构建期 UI 插件 | 运行时无头插件 |
|---|---|---|
| 包 | `plugins/<name>`，`gofor-plugin-*`（workspace） | 用户目录 `plugins/node_modules/gofor-plugin-*` |
| 何时加载 | `apps/web` 构建时，`@gofor/plugins` 聚合 | GoFor/Electron 启动时，主进程 `require` |
| 能注册 | 页面、命令、插槽、主题、CSS、数据、打印区块、扫描回填 | 命令、视图插槽、打印模板 |
| 数据 | 直接 import `@gofor/store`（受信构建期代码） | 只能走 `api.getTasks/updateTask` |
| 安装 | `pnpm install` + 重新构建 | `gofor plugin add` + 重启/`reloadPlugins()` |
| 契约 | `@gofor/plugin-api` | `@gofor/contracts`（五方法） |

**不要把 13 个构建期插件迁到运行时 API**：它们需要 React 页面和 Dexie，五方法 API 故意不含这些。

## 2 磁盘布局

```
<userData>/                      # app.getPath('userData')，Linux 默认 ~/.config/GoFor
├── plugins/
│   ├── package.json             # 私有，不发布；dependencies 就是已安装插件
│   ├── gofor.plugins.json       # { "enabled": ["plugin-tomato", "plugin-print-a4"] }
│   ├── pnpm-lock.yaml
│   └── node_modules/
│       └── gofor-plugin-tomato/
│           ├── package.json     # 含 gofor 清单
│           └── dist/index.js    # gofor.main
└── logs/plugins.log
```

`enabled` 写的是**包名**。`gofor-plugin-hello` 的 `gofor.id` 是 `plugin-hello`，两者不同：
前者用于安装/目录，后者用于命令/插槽命名空间。

## 3 插件清单与入口

`package.json`：

```json
{
  "name": "gofor-plugin-tomato",
  "version": "0.1.0",
  "main": "dist/index.js",
  "gofor": {
    "id": "plugin-tomato",
    "displayName": "番茄钟",
    "version": "0.1.0",
    "main": "./dist/index.js",
    "apiVersion": "1",
    "capabilities": ["view-slot", "command"],
    "renderer": "./renderer.mjs"
  }
}
```

| 字段 | 规则 |
|---|---|
| `id` | 小写字母/数字/`._-`，不能以符号开头结尾；命令/插槽命名空间 |
| `main` | 相对包根目录，不能 `..`；必须是可 `require` 的 JS（Electron 33 = Node 20，建议 CJS） |
| `apiVersion` | 字符串，当前必须严格等于 `"1"` |
| `capabilities` | `command` / `view-slot` / `print-template`；注册未声明的能力 = 激活失败 |
| `renderer` | 可选；渲染进程入口（ESM），视图插槽组件从这里懒加载 |

入口：

```ts
import type { GoForPluginAPI } from '@gofor/contracts';

export function activate(api: GoForPluginAPI): void | Promise<void> {
  api.registerCommand({ id: 'plugin-tomato/start', title: '开始专注', handler() {} });
  api.registerViewSlot('home.after-stats', { displayName: 'TomatoBadge' });
}

export function deactivate(api: GoForPluginAPI): void | Promise<void> {}
```

## 4 GoForPluginAPI（只有五个方法）

```ts
// 基础
registerCommand(command: { id: string; title: string; handler: () => void | Promise<void> }): void;
registerViewSlot(slotId: string, component: unknown): void;
registerPrintTemplate(template: { id: string; render: (task: Task) => string }): void;
getTasks(): Promise<Task[]>;
updateTask(id: string, patch: Partial<Task>): Promise<void>;

// v2 声明（组件/query/handler 在 gofor.renderer 里实现）
registerScreen({ id, title, group, order?, icon?, layout?, chrome?, component }): void;
registerTheme({ id, name, tokens }): void;
registerData({ id, version, summary }): void;
registerScanHandler({ id, owner }): void;
```

v2 的 manifest 增加 `permissions` 与 `renderer`；capabilities 可取
`command | view-slot | print-template | screen | theme | data | scan`。

- `Task` 与 `@gofor/core/domain` 同形（id/title/subjectId/done/due/optional/subtasks/tags/sortKey/
  createdAt/updatedAt），定义在 `@gofor/contracts`，插件不需要依赖 monorepo 源码。
- 插件**不能** import Dexie、`@gofor/store`、`@gofor/core`；数据走宿主 API / 数据契约。
- 数据 provider 有 owner；插件禁用时该契约变成 `missing`，消费者必须显示未安装，
  不能继续读数据。归属表见 `DECISIONS/0013`。
- 外部插件页面/主题/数据 query/扫描 handler 都在 `gofor.renderer` 里按名字导出；
  主进程只登记可序列化声明，不能通过 IPC 传函数。
- `registerViewSlot` 的 `component` 在主进程只用于取导出名：
  `component.displayName ?? component.name ?? 'default'`。组件本身由渲染进程加载。
- 注册是**事务性**的：`activate` 抛错/超时时，这个插件已登记的东西全部丢弃，不会半截生效。

## 5 加载器（主进程）

实现在 `@gofor/plugin-runtime` 的 `PluginManager`：

1. 读 `plugins/gofor.plugins.json` 的 `enabled`（缺失/损坏 → 空列表 + 日志，不阻塞启动）。
2. `createRequire(join(pluginsDir, 'package.json'))`；
   `require('<包名>/package.json')` 取 `gofor`，再 `require` 包内绝对路径 `gofor.main`。
3. 校验 `apiVersion === "1"`；不匹配 → `incompatible`，不调 `activate`。
4. 用 `Promise.race` 调 `activate(api)`，默认 **5s** 超时。
5. 每个插件独立 `try/catch`：失败/超时只把它标 `failed`，其他插件照常；超时后迟到的注册
   忽略并打日志（不会把定时器回调变成未捕获异常）。
6. 状态快照 `snapshot()`：`{ version, plugins: PluginStatus[], slots, commands, printTemplates }`，
   全部可 JSON 序列化。

```ts
const manager = new PluginManager({
  userDataDir: app.getPath('userData'),
  taskStore, // 宿主注入，见 §7
  timeoutMs: 5000,
});
await manager.loadAll();       // 启动
await manager.reloadPlugins(); // 开发热重载：deactivate → 清注册表 → 重读清单
await manager.dispose();
```

日志追加到 `<userData>/logs/plugins.log`，格式
`[ISO] [level] [插件] 消息`。写日志失败（只读/磁盘满）只丢日志，不影响加载。

## 6 CLI

```bash
gofor plugin add gofor-plugin-hello
gofor plugin remove gofor-plugin-hello
gofor plugin list
# 绿色版/测试：--user-data <dir> 或 GOFOR_USER_DATA 覆盖 userData
```

`add` = 在 `<userData>/plugins` 执行 `pnpm add <pkg>`，成功后把包名写入 `enabled`；
`remove` = `pnpm remove <pkg>` 并从 `enabled` 删除（**不删插件数据**）。
CLI 是独立进程，改完不会自动热重载：提示用户重启，或在应用内调 `reloadPlugins()`。

包名只接受 `gofor-plugin-[a-z0-9-]+`；本地 `file:` 试装要手动 `pnpm add` 再改 `enabled`。

## 7 渲染进程如何拿到 UI 扩展（IPC）

主进程注册的插槽**不能**把 React 组件跨进程传过去。方案是"元数据过 IPC，组件按 URL 懒加载"：

```
主进程 PluginManager ──snapshot()──▶ ipcMain.handle('gofor:plugins:snapshot')
        │                                    │
        │ registerViewSlot(slotId, comp)      │ IPC invoke
        ▼                                    ▼
  slots: [{ slotId, pluginId, packageName, renderer, componentName }]
                                             │
渲染进程 createPluginRendererClient(ipcRenderer).snapshot()
                                             │
                       对 home.after-stats 的每一项：
                       loadViewSlotComponent(slot, (url) => import(url))
                                             │
                       import('gofor-plugin://gofor-plugin-hello/renderer.mjs')
                                             │
                          主进程协议只读 plugins/node_modules/<包名>/
                                             │
                                 取 module['HelloSlot'] ?? module.default
```

IPC 只有三个频道，没有 eval、没有任意代码字符串：

| 频道 | 返回 |
|---|---|
| `gofor:plugins:snapshot` | `PluginSnapshot`（状态 + 插槽 + 命令 + 打印模板） |
| `gofor:plugins:reload` | 重载后的 `PluginSnapshot` |
| `gofor:plugins:run-command` (id) | `{ ok, error }`，命令异步执行 |

渲染进程代码：

```ts
import {
  createPluginRendererClient,
  loadViewSlotComponent,
} from '@gofor/plugin-runtime/client';

const client = createPluginRendererClient(window.goforPluginHost);
const snapshot = await client.snapshot();

for (const slot of snapshot.slots.filter((item) => item.slotId === 'home.after-stats')) {
  const Component = await loadViewSlotComponent(slot, (url) => import(/* @vite-ignore */ url));
  // 宿主决定怎么渲染 Component；没有 renderer 的插槽会抛"没有渲染入口"
}
```

`preload.cjs` 只暴露白名单：

```js
contextBridge.exposeInMainWorld('goforPluginHost', {
  invoke(channel, ...args) {
    if (!PLUGIN_CHANNELS.has(channel)) return Promise.reject(new Error('不允许的频道'));
    return ipcRenderer.invoke(channel, ...args);
  },
  // onTaskRequest / sendTaskResult 见 §8
});
```

`gofor-plugin://` 协议在 `apps/desktop/main.mjs`：包名必须匹配 `gofor-plugin-*`，
文件路径必须落在 `plugins/node_modules/<包名>/` 内，MIME 显式指定（ESM import 必需），
越界 403、缺失 404，**不经过 eval**。

## 8 任务数据桥（主进程 ↔ IndexedDB）

主进程读不到 IndexedDB，所以 `TaskStore` 是注入的。Electron 宿主用 request/response：

1. 主进程生成 `requestId` 与 `resultChannel = gofor:tasks:result:<uuid>`；
2. `webContents.send('gofor:tasks:request', { requestId, resultChannel, kind, payload })`；
3. 渲染进程处理 `kind = tasks:list | tasks:update`，再 `ipcRenderer.send(resultChannel, { ok, value })`；
4. 主进程 5s 超时；渲染进程未接线时返回明确错误，插件看到的是 rejected Promise。

渲染进程参考实现（放进 web 后由 main.tsx 调一次；本次未接线）：

```ts
import { db, listTasks, updateTask, type TaskPatch } from '@gofor/store';

window.goforPluginHost.onTaskRequest(async (request) => {
  try {
    if (request.kind === 'tasks:list') {
      window.goforPluginHost.sendTaskResult(request.resultChannel, {
        ok: true,
        value: await listTasks(db),
      });
      return;
    }
    if (request.kind === 'tasks:update') {
      await updateTask(db, request.payload.id, request.payload.patch as TaskPatch);
      window.goforPluginHost.sendTaskResult(request.resultChannel, { ok: true, value: null });
      return;
    }
    window.goforPluginHost.sendTaskResult(request.resultChannel, {
      ok: false,
      error: `未知任务请求：${request.kind}`,
    });
  } catch (error) {
    window.goforPluginHost.sendTaskResult(request.resultChannel, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

## 9 安全与信任模型

- 运行时插件是**受信 Node 代码**：`require` 就是完全执行，`pnpm add` 会跑安装脚本。
  没有沙箱、没有签名、没有权限拦截。装插件 = 允许它在主进程执行任意代码。
- 失败隔离只保证"不阻塞启动/不连累其他插件"，不是安全边界。
- IPC 只回可序列化快照；视图组件只能从 `gofor-plugin://` 的插件目录加载，协议拒绝路径穿越。
- 改 `enabled` 只影响加载，不删数据；插件数据仍在渲染进程的 IndexedDB（见 `docs/PLUGINS.md` §7）。

## 10 排障

| 症状 | 先看 |
|---|---|
| 插件没加载 | `userData/logs/plugins.log` 最后几行；`gofor plugin list`；`enabled` 是否含**包名** |
| `incompatible` | `gofor.apiVersion` 必须是字符串 `"1"` |
| `failed` + `Cannot find module` | `gofor.main` 路径、是否已 `pnpm build`、入口是否 CJS |
| 插槽不显示 | manifest 是否有 `gofor.renderer`；导出名是否等于 `component.displayName` |
| 命令点了没反应 | `runCommand` 结果 `{ ok, error }`；命令 id 是否 `<pluginId>/<x>` |
| `getTasks` 超时 | 渲染进程没装 `runtimeBridge`（§8）；`apps/desktop` 是否在 web 加载后启动 |
