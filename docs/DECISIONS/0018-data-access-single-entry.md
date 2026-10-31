# 0018 — 数据访问单一入口：禁用由 provider 生命周期决定

日期：2026-10-31
状态：**已实现**
相关：`0013`、`0017`、`0016`

## 原则

插件私有数据（tasks / habits / mood / diary / checklist / timetable / toolbox）
只能通过一个地方进入：**数据 provider + host.data**。

插件禁用不是“在消费者里加 if”，而是：

```text
插件禁用
  → 它的 provider 从 entries 中移除
  → 所有消费者拿到的都是 missing / 空
```

消费者不应知道“哪个插件拥有哪张表”。

## 这次怎么落

1. 删除 `App` 对 `listTasks/listHabits/loadTimetable` 的直接读取；
2. 新增 `habits.all`、`timetable.current` provider（带 owner）；
3. `App` 用 `useHostData('tasks.all' | 'habits.all' | 'timetable.current')`；
4. 外部插件激活后，宿主按 **active external ids + 内置 enabled ids** 重建 core entries；
5. 外部 main 的 `getTasks/updateTask` 直接拒绝：main 没有 IndexedDB，也不该绕过 provider；
6. `PluginScreenHost.data` 按 `data.read` 权限限制；外部 bridge 的 data/storage 同样；
7. `pnpm check:boundaries` 同时检查：
   - 插件不得 import `@gofor/store`；
   - core/app 不得直接读插件私有表（broker/host 例外）。

## 例外

`DataScreen` / `BackupBanner` 的备份导出/导入会读全部表——这是用户显式备份，
必须包含已禁用插件的数据，否则禁用一次就丢备份。它们不走 provider 是刻意例外。

## 影响

- 禁用作业插件后，首页/打印/模板/扫描都拿不到任务；
- 启用后 provider 回来，不需要任何消费者加开关；
- 外部插件 active 时 core provider（tasks.all 等）也会恢复；
- 旧 e2e harness 仍待外部化重写。

## 未做

- 外部 main 的数据 broker（需要 SQLite/WS）仍未做；
- `DataScreen` 备份是唯一允许直接读全表的 core 路径。
