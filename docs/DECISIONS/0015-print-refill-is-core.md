# 0015 — 打印回填回归 core；插件只处理自己的数据

日期：2026-10-31
状态：**已实现**
相关：`0006`（全功能插件化）、`0013`（插件数据归属）、`0014`（首页块/权限）

## 问题

打印 + 拍照回填是产品的主闭环（纸是主输入端），但它被拆成了 `gofor.scan` 插件：

- `gofor.scan` 被禁用/卸载后，核心的“扫描回填”入口和页面直接消失；
- 扫描页面的 store 访问还挂在一个不存在的插件 id 的 allowlist 上；
- core 首页为了显示入口，又要依赖插件注册的首页块。

这是把 core 能力错误地当成了插件能力。

## 决定

1. 扫描 UI/流程迁回 core：`packages/scan`（`@gofor/scan`），`ScanCoreScreen` + `ScanScreen`；
2. `apps/web` 的 `scan` 是 **CORE_NAV 核心页面**，不经过插件注册/禁用；
3. 删除 `gofor.scan` 构建期插件：`plugins/scan` 移走，`@gofor/plugins` 的 order/rules 移除；
4. core 首页注册 `core.paper` 块（纸面闭环），打印/回填入口不再依赖插件；
5. 插件仍保留自己的 **数据 handler**（tasks/checkin/mood 的 `scan.handle`）：
   core 负责拍/校正/识别/确认/分发，插件只写自己的数据——与 0013 一致；
6. core 扫描页面用 `createCoreStore()`（core 可信代码），不再借用 `gofor.scan` 的插件 allowlist。

## 影响

- 所有插件禁用时，打印/扫描仍可打开；只是对应数据 handler 缺失，待确认页显示 missing。
- `gofor.scan/screen` 旧深链重定向到 `scan`。
- 构建期插件从 13 个变为 12 个；`packages/scan` 是 core 包，不是插件包。
- 扫描页懒加载，主包保持在约 769KB，不把 zxing/相机代码塞进首屏。
- e2e 扫描用例全部通过。

## 未做

- 打印模板/纸面区块仍由 core 拥有（本来就属于 core）。
- 插件 print block 归属仍用于“插件禁用时跳过区块”；这是数据能力，不是打印 UI。
