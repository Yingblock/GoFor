# 0006 — 除打印外，所有功能都变成插件

日期：2026-10-30
状态：**已实现**；其中"运行时单文件插件"部分已被 `0007` 取消
相关：`docs/ROADMAP.md` P3.5；`docs/DECISIONS/0004-plugin-extension-boundaries.md`、
`0005-p3-plugin-implementation.md`；`apps/web/src/plugins/`、`packages/plugin-api`

## 背景

P3 只把 5 个行为屏迁成了插件，番茄钟 / 作业 / 课表 / 打卡 / 扫描仍是 App 里的
`switch` 分支。用户 2026-10-30 明确要求：**用插件模型重构，除打印外的其他功能均插件化**。

## 决定

### 1. 功能边界

| 类别 | 归属 | 说明 |
|---|---|---|
| 应用外壳 / 首页布局 | core | 路由、导航、`ScreenBoundary`、命名插槽的容器 |
| **打印**（打印页、模板编辑器、校准页、`PrintLayer`、坐标清单、扫描几何） | core | 纸面契约，见下方"为什么打印不动" |
| **数据与备份 / 插件管理** | core | 引导悖论：插件被禁用时仍要能恢复数据和启用插件 |
| 番茄钟 / 作业 / 课表 / 打卡 / 扫描 | **插件** | 通过 `registerScreen` 贡献，`#/s/<pluginId>/<screenId>` |
| 环境清单 / 三格自评 / 周报 / 日记 / 工具箱 / 单词库 | **插件** | P3 已迁，本轮保持 |
| 主题 / 作用域 CSS / 转换器 | **插件** | 扩展能力插件 |

功能插件清单：

```
gofor.pomodoro   番茄钟      gofor.tasks      作业清单
gofor.timetable  课程表      gofor.checkin    每日打卡
gofor.scan       扫描回填    gofor.checklist  环境清单
gofor.mood       三格自评    gofor.report     自我周报
gofor.diary      情绪日记    gofor.toolbox    自助工具箱
gofor.wordbook   单词库      gofor.theme.sepia / gofor.convert（扩展能力）
```

### 2. 两类插件，两种信任级别

| | 构建期插件（npm 包，现在唯一形态） | ~~运行时插件~~（已在 `0007` 取消） |
|---|---|---|
| 代码来源 | 随应用编译（`@gofor/plugins`） | ~~单文件 ESM，Blob import~~ |
| 能否 import core/store | **能**（可信任代码） | ~~不能~~ |
| 能写 core 表 | 能（走仓储函数） | ~~不能~~ |
| 版本 | 与应用同版本，typecheck 兜底 | ~~运行时 `apiVersion` 校验~~ |
| 用途 | GoFor 自己的功能、内置扩展 | ~~第三方实验/内容插件~~ |

本轮把功能插件放在 `apps/web/src/plugins/builtins/`，是"构建期插件"这一档。
它们仍然通过 `registerScreen` / manifest / 注册表进入宿主，和运行时插件走**同一套**
页面、命令、插槽、主题、数据契约路径；区别只是允许直接 import core。

这样做的原因：功能屏（作业/课表/打卡）要写 core 数据、参与打印输入；如果为了让
"运行时也能改"而把写能力开给任意 JS，等于把 3.9 的只读边界拆掉。构建期插件保住了
数据不变量，同时满足"功能即插件"的架构目标。

### 3. 导航顺序用 `order`，不靠注册顺序

`ScreenContribution.order`（以及 `NavItem.order`）决定分组内顺序；缺省排最后。
内核占位项（笔记本/画板/使用时长）也有 order，所以插件化后侧栏顺序与 P2 一致，
不会出现"灰掉的占位项排在可用功能前面"。

### 4. 旧深链必须继续可用

`App.tsx` 的 `LEGACY_SCREEN_REDIRECTS` 把旧 id 映射到新插件页：

```
pomodoro → gofor.pomodoro/screen     tasks → gofor.tasks/screen
timetable → gofor.timetable/screen   checkin → gofor.checkin/screen
scan / capture → gofor.scan/screen   checklist/mood/report/diary/mind → …
```

插件被禁用时，深链落到不存在页面 → 自动回首页，不会白屏。

### 5. 打印区块也有 owner（2026-10-30 补充）

打印页/版式留在 core，但**区块的归属**不能留在 core：

- 插件 manifest 用 `provides.printBlocks` 声明自己拥有哪些 kind：
  `gofor.tasks → checkboxList`、`gofor.checkin → habitRow/checkboxGrid`、
  `gofor.timetable → schedule`、`gofor.mood → ratingGrid`；
- 打印/模板预览前用 `resolvePrintBlocks` 过滤：owner 插件禁用/卸载 → 该区块
  **静默跳过渲染与打印**，预览下方给警告「缺失「XX」插件：N 个区块已跳过」；
- 未知 kind（旧/外部模板）同样跳过并警告；
- 过滤后的 blocks 才进 `layout` / `materialize` / 坐标清单，保证纸与清单一致；
- 打印区块只允许**内置插件**声明 owner：运行时插件卸载后没有记录可查，
  否则旧模板会退回 core 渲染。安装时直接拒绝。
- **禁用/卸载不删数据**：`pluginData` 默认保留（`deletePluginRecord` 只有
  `deleteData: true` 才清），重新启用后区块与数据一起回来。
- 运行时安装入口已在 `0007` 删除；打印区块只允许构建期插件声明。

### 6. 扫描结果按 owner 交给插件处理（2026-10-30 补充）

- 坐标清单的每个 target 记录 `owner`（由 block owner 生成），`ScanResult` 带 owner；
- 旧清单没有 owner → 按 payload 前缀回退（`task→gofor.tasks`、`habit→gofor.checkin`、
  `mood→gofor.mood`）；
- 插件用 `registerScanHandler` 注册处理器（权限 `scan.handle`），宿主按 owner 分组调用；
- 缺插件 / 处理器抛错：确认页明确显示「缺失「XX」插件，N 项未回填」，
  **不写库、不标 applied**，重新启用后可以再点一次；
- core 的 `applyScanResults` 只作为写库原语被插件调用，不再由 UI 直接硬编码类别。

### 7. 为什么打印页/模板页不动

打印/扫描共享三份契约：`FIDUCIALS` 几何、`sheetManifests` 坐标清单、二维码/条码短码。
任何一项被插件改写，都会变成"纸上有格子、扫回来没数据"的静默错数据。打印页、
模板编辑器、校准页、`PrintLayer` 因此留在 core；插件能做的只有**声明式模板**
（P3.5 未实现，见 LATER/ROADMAP 后续）。

同理，数据与备份、插件管理留在 core：它们必须在"所有功能插件都可能被禁用"时仍然可用。

## 影响

- `App.tsx` 的 `switch` 只剩 home / print / templates / data / plugins + ComingSoon；
- 12 个功能插件 + 2 个扩展能力插件全部经注册表进入侧栏、命令面板、hash 路由；
- 首页跳转改指插件 id（拍照入口指向 `gofor.scan/screen`）；
- `Tasks` 自己取数据（插件页面不再由 App 传 props）；
- 扫描页通过注入的 `host.navigate('print')` 跳打印，不自己改 hash；
- e2e 仍按标题点侧栏，覆盖旧路径；新增"禁用功能插件后打印仍能出纸"的回归。

## 未做 / 下一步

- 运行时写能力（tasks/habits/sessions）与服务契约（public/private 方法 facade）还没有；
  现在第三方插件能读数据、加页面/插槽/主题/转换器，但不能改 core 数据；
- 插件仍以 monorepo 内的模块形式存在，没有拆成独立 npm 包；拆包需要把共享的
  `appClock`、`@gofor/ui`、store 依赖抽成 `@gofor/plugin-kit`；
- 模板插件、静态插件目录、sha256/版本范围尚未实现，见 `docs/LATER.md`；
- 运行时插件不能声明 `printBlocks`（卸载体不到 owner），暂时只允许内置。

## 验收

- `pnpm verify` 全绿；
- 侧栏中的功能页全部来自插件注册表；
- 禁用任一功能插件：侧栏条目消失、深链回首页、其它页面不崩；
- 禁用作业/打卡插件后，打印/模板页跳过对应区块，并在预览下方显示「缺失 XX 插件」；
- 扫描回填由插件 handler 处理；缺插件时确认页不写库、不标 applied。
