# 0016 — 12 个构建期插件外置迁移（实验）

日期：2026-10-31
状态：**迁移演示**
相关：`0014`（首页块/store 边界）、`0015`（打印回填 core）

## 目标

按用户要求验证：

1. 契约/生态/能力先补齐；
2. 现有 12 个构建期插件原样打成外部插件；
3. 从构建期插件注册表移除；
4. 看效果后再决定哪些放回构建期。

## 做法

### 1. 外部 renderer 兼容 PluginContext

`apps/web/src/plugins/external.ts` 不只读声明，还能：

- 加载 `renderer` ESM；
- 取 `pluginModule`；
- 用完整 `PluginContext` 激活它：
  - screen / homeBlock / command / slot / theme / css
  - content / converter / connector
  - data / scanHandler / OCR / AI
  - storage / store / data / now / newId

这样现有插件源码不需要重写。

### 2. React 由宿主提供

外部 bundle 用 `tools/external-runtime/react.ts` / `jsx-runtime.ts` 代理
`window.__GOFOR_HOST__.React` 与 `jsxRuntime`；不重复打包 React，避免 hooks 双实例。

### 3. 外部化构建

`tools/build-external-plugins.mjs` 用 Vite library 模式把 12 个插件源码打成：

```text
external-plugins/gofor-plugin-<name>/
  main.cjs
  package.json（gofor manifest + renderer）
  dist/plugin.js（内含页面/首页块/数据/扫描 handler）
```

`pnpm plugins:build` 构建，`pnpm plugins:install` 安装到 userData/plugins 并写 enabled。

### 4. 构建期插件清空

`@gofor/plugins` 的 `BUILTIN_PLUGINS = []`；12 个包仍保留为**外部插件源码**和单测，
但不再被 app 构建图 import。

### 5. 外部启停

`plugin-host` 新增 `POST /api/plugins/enable`；插件目录对外部插件显示启用/禁用。
禁用后区块/页面消失，但保留在安装页（宿主缓存 disabled 信息）。

## 效果

- 4173 + plugin-host 时可加载 12 个外部插件：页面、首页块、主题、数据、扫描 handler。
- 任务新增、首页计数、周报数据、打印区块均已验证。
- 主包不包含插件代码；插件按需从 47822 加载。

## 已知未完成

- 旧 `e2e/smoke.mjs` 假设内置插件，需改为外部插件 harness；本轮以手动/独立验证为主。
- 外部插件仍走构建期 `PluginContext` 兼容层，不是最终对外 SDK；正式 SDK 需把贡献类型收敛到 `@gofor/contracts`。
- 外部禁用插件重新启用后，插件目录保留入口，但构建期 e2e 的禁用/启用流程尚未完全迁移。
- 外部插件数据仍在当前设备 IndexedDB；集中数据/LAN 鉴权未做。

## 决定

用户查看效果后再决定哪些插件放回 `BUILTIN_PLUGINS`。
