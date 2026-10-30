# 0008 — 运行时插件系统（Node/Electron 主进程）与 13 个插件拆包

日期：2026-10-30
状态：**已实现**（渲染进程接线仅提供宿主骨架，见「未做」）
相关：`0002`（Electron 只是试验壳）、`0004`（边界）、`0006`（全功能插件化）、
`0007`（取消运行时加载）、`docs/PLUGIN-RUNTIME.md`、`docs/PLUGINS.md`

## 背景

`0007` 明确取消了运行时单文件 JS（Blob → `import()`），只保留构建期插件。原因仍然成立：
单文件无法 typecheck、没有沙箱、双路径双语义。

用户 2026-10-30 提出新的目标：**把插件系统改成"运行时动态加载"，模仿 dsh 的做法**，
并给出完整规格：`gofor-plugin-*` 包、`userData/plugins` + pnpm、主进程
`createRequire`、`gofor` 字段 manifest、五方法 `GoForPluginAPI`、5s 超时、CLI、IPC 插槽列表。

冲突点（开工前已向用户确认，全部按推荐项执行）：

1. 仓库没有常驻主进程：产品是 PWA，`tools/package-windows` 是已停止的一次性 Electron 壳；
2. 现有 13 个插件是 React 页面 + Dexie + `registerScreen/theme/data`，与五方法 API 不兼容；
3. `registerViewSlot(slotId, component)` 的组件函数跨不了 IPC；
4. 主进程读不到渲染进程的 IndexedDB。

## 决定

1. **新增 `@gofor/contracts`**：只放 `GoForPluginAPI`、`PluginManifest`、`PluginStatus`、
   `Task`、`PluginCommand`、`PluginPrintTemplate`、`GoForPluginModule`。零依赖、零副作用，
   不依赖 Electron / React / Dexie / core。API 严格只有五个方法（命令 / 视图插槽 / 打印模板 /
   getTasks / updateTask）。
2. **新增 `@gofor/plugin-runtime`（主进程）**：
   - 插件目录 `app.getPath('userData')/plugins/`，清单 `gofor.plugins.json` 的 `enabled`；
   - 用 `createRequire(plugins/package.json)` require 包 `package.json`，读 `gofor.main` 后
     `require` 绝对路径；`apiVersion` 严格等于核心支持的 `"1"`；
   - `activate(api)` 用 `Promise.race` 限时 5s；单插件失败/超时只标记该插件 `failed`，
     不阻塞启动、不影响其他插件；超时后迟到的注册忽略并记日志；
   - `reloadPlugins()`：先对已激活插件调 `deactivate`，清空注册表，再重读清单；
   - 日志追加到 `userData/logs/plugins.log`；日志失败不影响加载；
   - `TaskStore` 由宿主注入（主进程不拥有数据）。
3. **新增 `@gofor/plugin-cli`**：`gofor plugin add/remove/list`，在 `userData/plugins` 执行
   `pnpm add/remove`，维护 `enabled`；CLI 只接受 `gofor-plugin-*` 包名。
4. **视图插槽 = 元数据 + 渲染入口**：主进程只登记
   `{ slotId, pluginId, packageName, renderer, componentName }`，IPC 返回可序列化快照；
   manifest 新增可选 `gofor.renderer`，渲染进程动态 import
   `gofor-plugin://<包名>/<renderer>`（主进程协议只读 `plugins/node_modules/<包名>/`）。
   **没有 eval、没有 Module Federation、没有微前端。**
5. **任务数据**：`PluginManager` 只依赖注入的 `TaskStore`；Electron 宿主经
   request/response IPC 转发给渲染进程的 Dexie/IndexedDB（协议见
   `docs/PLUGIN-RUNTIME.md`）。
6. **现有 13 个插件拆成 13 个 `gofor-plugin-*` workspace 包**（`plugins/<name>/`，各自
   `package.json` + `tsconfig.json`），`@gofor/plugins` 退化为聚合层，`apps/web` 与
   `packages/core` 的 import 不变。**它们仍是构建期 UI 插件**：五方法 API 无法承载 React 页面、
   Dexie、主题、扫描回填；强行迁移等于重写 13 个功能页并推翻 `0004/0006`。
7. **`apps/desktop` 最小 Electron 宿主**：固定端口静态服务、`gofor-plugin://` 协议、
   `createElectronPluginRuntime`、渲染进程任务桥的 preload 白名单。

## 影响

- 仓库出现**两条插件平面**，边界必须写清：
  - 构建期 UI 插件（13 个包）：随 `apps/web` 构建，注册页面/主题/数据/打印归属；
  - 运行时无头插件（`gofor-plugin-*` 安装到 userData）：只做命令/插槽/打印模板/任务读写。
- `pnpm-workspace.yaml` 增加 `plugins/*`；`@gofor/plugins` 增加 13 个 workspace 依赖；
  lockfile 增加 13 个 importer；web bundle 尺寸不变（仍 756KB 主包 + 423KB 扫描 chunk）。
- 运行时插件是**受信 Node 代码**（`require` 就是完全执行），不是沙箱；安装脚本也照常执行。
  能装什么插件等价于"谁能往 userData/plugins 里写东西"。
- `apps/desktop` 不把 electron 写进依赖（体积大、平台相关）；`pnpm start` 需要外部 Electron。
  PWA 仍是正式分发形态（`0002` 的结论不变）。
- 新增单测 29 条（runtime 17 + CLI 12），`pnpm -r typecheck` 与 `pnpm build` 通过。

## 未做

- 运行时插件的页面/主题/扫描回填：五方法 API 故意不含；需要时另立契约，不在本次偷偷加。
- 渲染进程插件列表 UI / 插槽渲染组件：只交付 IPC 快照类型与懒加载 helper，`apps/web` 未接线。
- 插件签名、registry、版本范围、依赖解析、service facade、沙箱、网络权限。
- 将 13 个构建期插件迁移到运行时 API（会丢 UI；需要重写，另立阶段）。
