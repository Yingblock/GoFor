# 插件规则清单

> 机器可读版本：`packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`。
> 这里只写"规则"，不写实现；实现边界见 `DECISIONS/0006`。

## 总则

- **插件是 npm 包**：现在统一在 `@gofor/plugins`（`packages/plugins`）里，每个插件是包内一个子目录；
  拆分独立包时保持 `id`、manifest、贡献项不变即可。
- **没有运行时单文件 JS 加载**：没有 Blob/`import()`、没有 `plugins.source` 写入、
  没有 `window.GoForSDK`；插件随应用构建，更新 = 重新构建/发版。
- 插件页面 id 一律 `<pluginId>/<screenId>`；命令/插槽/主题/CSS/内容模块/转换器同理。
- 权限在注册期检查；插件是构建期受信代码，**不是沙箱**的运行时概念已不适用。
- 插件之间只能通过 `DataContract` 交换数据；禁止互读 `pluginData`。
- 数据只走 Dexie v8 `pluginData` 容器（`<pluginId>/<collection>/<key>`）；禁用/卸载不清数据。
- 打印区块归属 `provides.printBlocks`；只有内置插件能声明（运行时插件已取消）。
- 扫描回填用 `registerScanHandler`；缺插件不写库、不标 applied。
- 导航顺序用 `ScreenContribution.order`；旧深链必须写进 `LEGACY_SCREEN_REDIRECTS`。

## 现有插件

| 插件 id | 名称 | 页面 | 权限 | 打印区块 | 扫描处理器 | 插槽 / 其它 |
|---|---|---|---|---|---|---|
| `gofor.pomodoro` | 番茄钟 | `gofor.pomodoro/screen` | `ui.screen` | — | — | — |
| `gofor.tasks` | 作业清单 | `gofor.tasks/screen` | `ui.screen`, `scan.handle` | `checkboxList` | `gofor.tasks/scan` | — |
| `gofor.timetable` | 课程表 | `gofor.timetable/screen` | `ui.screen` | `schedule` | — | — |
| `gofor.checkin` | 每日打卡 | `gofor.checkin/screen` | `ui.screen`, `scan.handle` | `habitRow`, `checkboxGrid` | `gofor.checkin/scan` | — |
| `gofor.scan` | 扫描回填 | `gofor.scan/screen` | `ui.screen` | — | — | — |
| `gofor.checklist` | 环境清单 | `gofor.checklist/screen` | `ui.screen` | — | — | — |
| `gofor.mood` | 三格自评 | `gofor.mood/screen` | `ui.screen`, `scan.handle` | `ratingGrid` | `gofor.mood/scan` | — |
| `gofor.report` | 自我周报 | `gofor.report/screen` | `ui.screen`, `data.read` | — | — | 消费 7 个数据契约（可选依赖 `wordbook.entries`） |
| `gofor.diary` | 情绪日记 | `gofor.diary/screen` | `ui.screen` | — | — | — |
| `gofor.toolbox` | 自助工具箱 | `gofor.toolbox/screen` | `ui.screen` | — | — | — |
| `gofor.wordbook` | 单词库 | `gofor.wordbook/screen` | `ui.screen`, `ui.slot`, `data.provide`, `storage` | — | — | 插槽 `home.after-stats`；提供 `wordbook.entries` |
| `gofor.theme.sepia` | 护眼主题 | — | `ui.theme`, `ui.slot`, `ui.css` | — | — | 插槽 `app.header.right`；默认禁用 |
| `gofor.convert` | 纯文本转换 | — | `converter` | — | — | Worker 任务 `markdown-to-text` |

## 数据契约

| 契约 | 提供方 | 版本 | 说明 |
|---|---|---|---|
| `sessions.range` | core | 1 | 区间学习记录 |
| `subjects.all` | core | 1 | 全部科目 |
| `habits.range` | core | 1 | 打卡项 + 区间记录 |
| `mood.range` | core | 1 | 三滑块 |
| `diary.range` | core | 1 | 情绪日记 |
| `toolbox.recent` | core | 1 | 练习记录 |
| `tasks.all` | core | 1 | 作业 |
| `checklists.all` | core | 1 | 环境清单定义 |
| `wordbook.entries` | `gofor.wordbook` | 1 | 单词库词条（可按词/标签过滤） |

## 不变量

1. 打印/扫描几何、模板、坐标清单、二维码/条码在 core；插件只声明区块归属，不能算坐标。
2. 缺插件时打印区块静默跳过，预览下方给「缺失 XX 插件」；不画空框。
3. 扫描结果按 `owner` 路由；缺插件/处理器抛错时不写库、不标 applied，可重试。
4. 插件数据禁用/卸载保留；备份含 `pluginData`。
5. 插件页面懒加载；`chrome:'none'` / `layout:'full'` 不得把打印层卷进 `.screen-only`。
6. 主题只覆盖屏幕层 token；纸面固定白底黑字。
