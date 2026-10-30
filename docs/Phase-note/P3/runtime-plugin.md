# P3.7 运行时插件：新增文件与边界

> 决策见 `docs/DECISIONS/0008`；操作手册见 `docs/PLUGIN-RUNTIME.md`。

## 新增

- `packages/contracts/`：`GoForPluginAPI`（五方法）、`PluginManifest`、`PluginStatus`、`Task`。
- `packages/plugin-runtime/`：主进程 `PluginManager`（扫描/加载/超时/隔离/reload/日志/IPC）、
  Electron 适配器、渲染进程 client（snapshot/懒加载 helper）、29 条断言中的 17 条。
- `packages/plugin-cli/`：`gofor plugin add/remove/list`，12 条单测。
- `apps/desktop/`：最小 Electron 主进程、`gofor-plugin://` 协议、preload 白名单、任务桥。
- `examples/gofor-plugin-hello/`：独立示例（不在 workspace），命令 + 视图插槽 + ESM renderer。
- `plugins/<name>/`：13 个构建期插件包从 `packages/plugins/src/<name>` 迁出，各带 `package.json`/`tsconfig.json`。

## 修改

- `packages/plugins/src/index.ts`：改为从 `gofor-plugin-*` 导入；`BUILTIN_PLUGINS` 顺序不变。
- `packages/plugins/src/rules.ts`：`packageName` 改用 `PACKAGE_BY_ID` 查表。
- `packages/plugins/package.json`：增加 13 个 workspace 依赖；旧 `"./*"` 子路径导出已无消费者。
- `pnpm-workspace.yaml`：增加 `plugins/*`。
- `docs/ROADMAP.md` P3.7、`docs/STATE.md`、`docs/PLUGINS.md` §9、`README.md`、`AGENTS.md` 目录表。

## 没做 / 不要误读

- 13 个构建期插件**没有**迁到运行时 API；两条平面 API 不互通。
- `apps/web` 没接插件列表/插槽渲染；`apps/desktop` 任务桥默认可超时（见手册 §8）。
- `apps/desktop` 不依赖 electron；PWA 仍是正式分发形态。
