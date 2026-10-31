# 0010 — 构建期插件改用 Vite glob 自动发现

日期：2026-10-31
状态：**已实现**
相关：`0006`（全功能插件化）、`0007`（npm 插件）、`0008`（运行时插件）、`0009`（分层清理）

## 背景

`@gofor/plugins` 原来用静态 import 手写 13 个插件，后来用 `tools/sync-plugin-registry.mjs`
生成同样的静态 import + workspace 依赖。结果：

- 删掉 `plugins/<name>` 后必须先跑同步脚本，否则构建失败；
- 手工改注册表容易漏删数组项，模块顶层抛 `ReferenceError`，整页黑屏；
- `@gofor/plugins` 的 `package.json` 还列着已删除的 workspace 包，`pnpm` 会在 script 前
  直接报 `no package named ...`。

用户 2026-10-31 删除 `plugins/mood` 后遇到黑屏，要求 13 个构建期插件「地位完全相同」，
至少做到删任意目录都能正常构建运行。

## 决定

1. `packages/plugins/src/index.ts` 改用 Vite `import.meta.glob`：

   ```ts
   const PLUGIN_MODULES = import.meta.glob('../../../plugins/*/src/index.ts', { eager: true });
   ```

   按目录名 + `KNOWN_ORDER` 排序生成 `BUILTIN_PLUGINS`；未知目录按字母序追加。
2. 删除 `@gofor/plugins` 对 13 个插件的 `package.json` 依赖，只保留 `@gofor/plugin-api`；
   加 `vite` devDependency 与 `vite/client` types，供 `import.meta.glob` 类型检查。
3. 删除 `tools/sync-plugin-registry.mjs`；`tools/plugin-test.mjs` / `plugin-test.sh` 保留，
   但只做「纯 node + Vite 构建」，不再同步注册表。
4. 文档明确：这 13 个仍是**构建期插件**；运行时 `userData/plugins` 是另一条平面。

## 影响

- 删除任意 `plugins/<name>` 后，`pnpm build` 直接生效；`pnpm install` 也不会因缺失
  workspace 包失败。
- 13 个插件逐个删除后都验证过：Vite 构建成功、页面能加载、无 pageerror。
- 注册表不再静态 typecheck 每个插件包的导出；各插件包仍有自己的 `typecheck`，
  且 `buildPluginHost` 的 manifest 校验保留。
- 插件顺序仍由 `KNOWN_ORDER` 固定，新增未知插件追加在末尾；需要固定顺序时把它加进
  `KNOWN_ORDER`。
- 删除插件不会删 core 里的 ID 级降级契约（scan owner / print block owner / 旧深链），
  它们只负责「缺插件时跳过/提示」，不会让应用崩。
- 仍是构建期 React 插件，不能像 runtime 插件那样在 `userData/plugins` 热插拔。

## 未做

把 13 个构建期插件迁到运行时五方法 API：会丢页面/主题/扫描回填，需要重写，另立阶段。
