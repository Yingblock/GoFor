# 0007 — 取消运行时单文件 JS，插件改为 npm 包

日期：2026-10-30
状态：**已实现**
相关：`0004`（边界）、`0005`（P3 实现）、`0006`（全功能插件化）、`docs/PLUGINS.md` §8

## 背景

P3 有两条插件加载路径：

1. 构建期内置插件（`apps/web/src/plugins/builtins/`）；
2. 运行时单文件插件（Blob → `import()`，源码存 `plugins.source`，`window.GoForSDK`）。

用户 2026-10-30 决定：**删掉运行时单文件加载；现有插件 npm 包化；把插件规则写成文件。**

原因：

- 单文件插件无法 typecheck、不能正常带依赖/JSX，开发体验与"所有人可开发"冲突；
- 它不是沙箱，粘贴代码就是完全受信执行；权限检查在页面 host 上也不完整；
- 两条加载路径让宿主、备份、测试、文档都要维护两份语义；
- 项目是个人工具 + 离线优先，更新可以接受"重新构建"。

## 决定

1. **只保留构建期插件**。新增 `packages/plugins`（`@gofor/plugins`）与
   `packages/plugin-kit`（`@gofor/plugin-kit`）：
   - `@gofor/plugins` 放所有功能插件与它们的页面/视图、打印归属、扫描 handler；
   - `@gofor/plugin-kit` 放插件和宿主共享的时钟、日期格式、打印模板解析、
     `useHostData`（只依赖页面 props，不反向 import 宿主）。
2. **删除运行时加载链路**：
   - 删除 `apps/web/src/plugins/install.ts`（Blob → import）；
   - 删除 `window.GoForSDK` 注入与类型；
   - 删除插件目录里的安装/卸载 UI、`installPlugin` / `uninstallPlugin`；
   - 宿主只从 `BUILTIN_PLUGINS` 激活，不再 import `plugins.source`。
3. **Dexie 不改版本**：`plugins` 表仍存启用状态；`source` 作为旧字段保留但不再读取；
   `pluginData` 与备份切片不变。
4. **规则写文件**：
   - 机器可读：`packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`（从 manifest 推导）；
   - 人可读：`docs/PLUGINS.md` §8（页面/权限/打印区块/扫描 handler/插槽/契约）。
5. **打印区块与扫描归属保留**：`provides.printBlocks` 只允许构建期插件；
   禁用后区块静默跳过、预览下方提示；扫描 handler 按 owner 路由，缺插件不写库。

## 影响

- 主 bundle 从 ~1.23MB 降到 ~756KB；扫描（ZXing/vision）拆成独立懒加载 chunk（~423KB）；
- 插件页面/视图全部在 `@gofor/plugins`，`apps/web` 只剩宿主、打印、数据与备份、插件目录；
- 新增插件 = 新目录 + 登记 `BUILTIN_PLUGINS` + 重新构建；
- 不能给用户发 `.js` 侧载；第三方要参与就得用仓库/包并构建（或未来做包分发）；
- `plugins` 表里的旧 `source` 不执行；旧运行时插件记录不会出现在插件目录；
- `apps/web` 的 `clock.ts` / `format.ts` / `print/template.ts` 变成对 `@gofor/plugin-kit` 的兼容 shim，
  避免一次性改几十处相对 import。

## 未做

- 每个插件拆成独立 npm 包（现在是 `@gofor/plugins` 的多个子目录）；
- 插件 registry / 签名 / 版本范围 / 分发；
- service facade（public/private 方法）与第三方写 core 数据。
