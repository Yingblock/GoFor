# 0009 — core / domain / 插件包分层清理

日期：2026-10-31
状态：**已实现**
相关：`0004`（边界）、`0006`（全功能插件化）、`0007`（npm 插件）、`0008`（运行时插件）

## 背景

P3.6 把 13 个功能页迁成插件后，`@gofor/core` 仍保留 6 个功能域：
`pomodoro`（状态机）、`timetable`、`stats`、`habits`、`wellbeing`、`content/wordbook`。
用户 2026-10-31 指出「core 不干净」：已经插件化的功能，其内容还在 core。

逐个查消费者后，问题分两类：

1. **单插件专用**：`pomodoro/machine`（只有番茄插件 + store 的 `PomodoroRun` 类型）、
   `wellbeing`（只有工具箱）、`content/wordbook`（只有单词库）——应跟插件包走。
2. **被宿主/存储共用**：`timetable`（课表插件 + `apps/web/App.tsx`）、
   `stats`（4 个插件 + 首页）、`habits`（打卡/周报 + store + 首页）——
   搬进任何一个插件都会让 `store`/`apps/web` 反向依赖插件，比现在更脏。

另外 `packages/plugin-kit` 是 P3.6 的过渡共享包：`clock`（临时调试时钟）、`todayLabel`、
打印模板解析、`useHostData`。其中 `todayLabel`/打印模板解析是纯函数，不属于 kit；
`useHostData` 是 React hook，不能进 `plugin-api`（项目硬规则）。

## 决定

1. **新增 `@gofor/domain`**：承载被 store/宿主共用的产品领域
   - `timetable` / `stats` / `habits`（原样搬出 core，内部依赖改从 `@gofor/core` 取）；
   - `PomodoroRun` / `PomodoroPhase` / `PomodoroStatus` 类型（持久化形状，store 与备份用）；
   - 只依赖 `@gofor/core`，不依赖 React / store / 插件。
2. **单插件逻辑下沉**：
   - 番茄状态机 → `gofor-plugin-pomodoro/src/machine.ts`（类型仍从 domain 取）；
   - 工具箱练习数据/进度 → `gofor-plugin-toolbox/src/wellbeing.ts`；
   - 单词库 CSV/TSV 解析 → `gofor-plugin-wordbook/src/wordbook.ts`。
   对应单测随代码移动，插件包各自加 `test` 脚本与 vitest devDependency。
3. **`@gofor/core` 收缩为**：`clock` / `ids` / `config` / `paper` / `print` / `scan` / `plugin` /
   `domain`（共享实体）。`package.json` 移除 `./pomodoro`、`./timetable`、`./stats`、
   `./habits`、`./wellbeing`、`./content` 六个子路径导出。
4. **`plugin-kit` 拆分**：
   - `todayLabel` → `core/print/format.ts`；
   - 打印模板解析 → `core/print/templateResolution.ts`，从 `@gofor/core/print` 导出；
   - kit 只保留 `appClock`（调试时钟）与 `useHostData`，`package.json` 移除 `./format`、
     `./print-template` 子路径。
   - 彻底删除 kit 需要先下线调试时钟（`TODO(debug-clock)`）并把 `useHostData` 迁到 React 层；
     本轮不做，避免动 11 个插件的时钟语义。

## 影响

- 依赖方向固定为 `domain → core`、`store/app/plugins → domain`，没有反向依赖。
- `packages/core/src` 只剩 6 个目录：`config` / `domain` / `paper` / `plugin` / `print` / `scan`。
- 单测总数不变（574），只是重新分布：core 451→253，domain 140，插件包 58，
  runtime/CLI/store/vision 不变。
- web bundle 尺寸不变（index 756KB、扫描 chunk 423KB、CSS 35KB）。
- `@gofor/plugins` 聚合层与 13 个包的 `id`/manifest/贡献项不变；`apps/web` 只改 import 路径。

## 未做

- 删除调试时钟与 `plugin-kit`（等上线前按 `TODO(debug-clock)` 做）。
- 把 `core/plugin` 移到独立包：它是插件 manifest/解析/快捷键等宿主基础设施，
  按 `0006` 留在 core；不是功能插件内容。
- 把 `core/domain` 实体整体迁到 domain 包：会牵动全部 40+ import，收益低。
