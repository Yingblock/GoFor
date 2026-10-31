# 0019 — 打印区块按数据提供方可见，内置区块保留

日期：2026-10-31
状态：**已实现**
相关：`0013`、`0014`、`0018`

## 规则

打印区块分两类：

1. **数据区块**：由插件的 `provides.printBlocks` 声明归属：
   - `checkboxList` → `gofor.tasks`
   - `schedule` → `gofor.timetable`
   - `habitRow`、`checkboxGrid` → `gofor.checkin`
   - `ratingGrid` → `gofor.mood`
2. **内置区块**：没有 owner 的通用版式，不依赖任何插件：
   `title`、`hintLine`、`timeLog`、`linedBox`、`slots`、`timestamp`、`qrcode`、
   `table`、`progressDots`、`footer`、`pageBreak`。

## 行为

- 宿主把 **active + disabled installed** 插件的 `printBlocks` 都汇总成
  `printBlockOwners`；禁用插件的规则带 `enabled: false`。
- `isPrintBlockKindAvailable(kind, owners)`：
  - 无 owner → 内置区块，始终可用；
  - 有 owner → 只有 owner.enabled 时可用。
- 模板编辑器：
  - 「加区块」只列当前可用的区块；
  - 已有模板里由禁用插件提供的区块行隐藏，并提示「数据仍保留」；
  - 隐藏的区块不会从 draft 删除，重新启用后恢复。
- 打印/预览：`resolvePrintBlocks` 跳过禁用 owner 的区块并显示缺失警告。

## 本次修的两个宿主 bug

- 外部 active 集合之前把 disabled installed 也算 active，导致全禁用时
  `printBlockOwners` 为空，数据区块被误认为内置；
- `plugins` 快照同时拼 `external.plugins` 与 `disabledExternal`，禁用项重复。

## 不做

- 没有把所有 `Block` 的渲染实现搬进插件；core 仍负责版式/渲染，
  插件只声明「哪些数据区块归我」，避免把 React 渲染下沉到 manifest。
