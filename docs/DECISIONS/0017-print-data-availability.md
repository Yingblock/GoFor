# 0017 — 打印数据也必须按插件可用性门控

日期：2026-10-31
状态：**已实现**
相关：`0013`（数据归属）、`0015`（打印回填 core）、`0016`（外置迁移）

## 问题

禁用作业插件后，打印/模板仍然能读到任务数据。

根因不是 `resolvePrintBlocks` 失效，而是它只做了 **区块级** 过滤：

```text
App:
  listTasks(db) / listHabits(db) / loadTimetable(db)   ← 直接读数据
  → SheetData { tasks, habits, schedule }
  → PrintScreen / TemplateEditor / PrintSheet
```

`resolvePrintBlocks` 只决定哪些 **block** 跳过，`SheetData` 里的任务/打卡/课表仍然存在。
所以模板和预览照样能读到数据。

## 决定

`App` 组装 `SheetData` 时增加可用性门控：

- `tasksForDate`：`host.data.available('tasks.all')` 为 false 时返回空；
- `habitsForDate`：`host.data.available('habits.range')` 为 false 时返回空；
- `scheduleForDate`：课表插件未启用时返回空；
- `buildSheetData` / `buildSheetForDate` / `TemplateEditor` 共用这份空数据。

这样插件禁用后：

- 页面入口消失；
- 首页块消失；
- 打印区块跳过；
- **模板/预览也拿不到数据**。

## 影响

- 禁用作业插件后，打印页与模板页不再出现任务标题。
- 禁用课表/打卡插件后，对应数据同样为空。
- 外置迁移后同样生效（外部插件禁用 → data provider 消失 → `host.data.available` false）。

## 未做

- `App` 仍然是 core 直接 `listTasks/listHabits/loadTimetable` 读 store，只是在出口处清空；
  真正的数据面解耦应把打印数据也变成 provider/print-data 契约。
- 打印区块归属的 disabled 元数据依赖外部包 manifest；旧包缺 `provides.printBlocks` 时
  可能只得到空区块而不是「缺失插件」警告。
