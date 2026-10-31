# 0013 — 插件数据归属：禁用插件后数据契约必须 missing

日期：2026-10-31
状态：**已实现**
相关：`0004`（数据契约）、`0006`（全功能插件化）、`0012`（外部插件 v2）

## 问题

“禁用作业清单”只移除了页面/命令/插槽，但：

- 首页仍通过 `listTasks(db)` 直接显示任务统计和任务提示；
- 番茄钟仍通过 `listTasks(db)` 提供“绑定任务”；
- `tasks.all` 仍作为 core provider 存在，任何消费者都能继续读任务。

禁用插件只隐藏 UI、不撤销数据能力，等于假解耦。

## 决定

1. **数据 provider 带 owner**：`BuiltinDataProvider.owner` 标出归属插件：
   - `tasks.all` → `gofor.tasks`
   - `habits.range` → `gofor.checkin`
   - `mood.range` → `gofor.mood`
   - `diary.range` → `gofor.diary`
   - `checklists.all` → `gofor.checklist`
   - `toolbox.recent` → `gofor.toolbox`
   - `sessions.range` / `subjects.all` 保持 core（纸面/番茄共用，跨插件基础数据）
2. 宿主在构建数据 provider 时根据插件启用状态过滤；禁用后该契约是 `missing`，
   消费方显示“未安装”，不能读到数据。
3. **首页**：
   - 任务统计/任务提示只在 `tasks.all` 可用时渲染；
   - 打卡提示只在 `habits.range` 可用时渲染；
   - 今日课表只在 `gofor.timetable` 启用时渲染。
4. **番茄钟**：`tasks.all` 不可用时：
   - 不调用 `listTasks`；
   - 不显示“绑定任务”；
   - 不把任务 id 写进新的 focus run；
   - 仍可正常开始专注。
5. **扫描**：`tasks.all` 不可用时重建坐标不读取任务标签。
6. **打印**：区块归属已有 `owner`，插件禁用时静默跳过并显示“缺失插件”警告（原有行为）。

## 影响

- 首页/番茄/扫描不会在插件禁用后泄露该插件数据。
- 数据本身不删除；重新启用后恢复。
- 新增 e2e：
  - 禁用作业清单 → 首页无任务、番茄无绑定任务；
  - 禁用课程表 → 首页无今日课表；
  - 禁用每日打卡 → 首页无打卡提示。
- 仍有一个边界：`sessions`/`subjects` 是 core 共享数据，不随某个插件禁用消失。

## 未做

- 把所有消费者改成 `host.data.watch`（当前仍保留 App/首页的 store 读取，但已按可用性门控）；
- 外部插件数据的宿主集中；
- 科目/学习记录是否也应归属某个插件，需要产品决定。
