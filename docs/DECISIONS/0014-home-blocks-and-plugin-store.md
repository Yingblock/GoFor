# 0014 — 首页内容块 + 构建期插件 store 权限边界

日期：2026-10-31
状态：**已实现**
相关：`0012`（外部插件 v2）、`0013`（插件数据归属）

## 问题

1. 首页仍由 core 写死：主行动、任务、打卡、课表、统计、今日记录；插件只能往固定 slot 塞内容。
2. 构建期插件直接 `import '@gofor/store'`，manifest 的 `permissions` 只约束注册 API，
   约束不了数据访问；作业插件也能读打卡表。
3. 扫描的 `task:` / `habit:` / `mood:` 归属和 payload 前缀写死在 core。

## 决定

### 1. 首页只渲染插件的 homeBlocks

- 新增 `HomeBlockContribution`（`ui.home` 权限）：id/title/order/span/load。
- 插件注册：扫描（主行动）、课表、打卡、作业、番茄统计、单词库。
- core `Home` 不 import store、不读任务/打卡/课表；只做：
  - 按 `order` + 用户拖拽顺序排序；
  - 渲染标题和右侧拖拽手柄；
  - 顺序存 `localStorage.gofor.home.blockOrder`，刷新保持。
- 没有块时显示空态，不补默认内容。

### 2. 构建期插件的 store 权限边界

- 插件不再直接 import `@gofor/store`；`PluginContext.store` / `PluginScreenHost.store`
  只暴露 `call(operation)`。
- `@gofor/plugin-kit/store` 提供类型化包装（`PluginStoreApi`），插件调用
  `pluginStore(host.store)`。
- 宿主 `createPluginStore(pluginId)` 用 allowlist 按插件 id 授权：
  - tasks → tasks/tags/subjects.list
  - checkin → habits/habitLogs/applyScan
  - timetable → timetable/subjects/courseNotes
  - pomodoro → focus/sessions/config/subjects.list/ensureSubjects
  - mood/diary/checklist/toolbox/scan 各自域
  - 未知插件/未知操作/越权操作运行期抛错。
- 扫描 apply 只允许写自己的 payload 前缀，避免借 applyScan 跨域写库。
- `tools/check-plugin-boundaries.mjs` 在 `pnpm verify` 前检查插件源码，
  发现直接 import `@gofor/store` 直接失败；插件包也已移除该依赖。
- 这是**构建期能力隔离**，不是 JS 沙箱：插件仍与页面同线程；真正的不可信代码应走外部插件平面。

### 3. 扫描归属由 manifest 声明

- `provides.scanPayloads`（task/habit/mood）由插件声明；宿主汇总成
  `scanPayloadOwners`，传给 `scanResultOwner`。
- core 不再维护 `SCAN_PAYLOAD_OWNERS` 常量；旧纸没有 owner 又无插件声明时返回 null（missing），不猜。

## 影响

- 首页内容完全由启用插件决定；禁用插件后块消失；拖拽顺序持久化。
- 插件数据访问有运行期 allowlist + 构建期边界检查；43 个插件源文件已无 `@gofor/store` import。
- 新增 web 单测 3 条（越权/共享/未知操作），全仓 **580**。
- e2e 覆盖首页块、拖拽、刷新保持、禁用作业/课表/打卡后的首页与番茄。

## 未做

- 打印层仍由 core 组装 tasks/habits/schedule 数据并拥有默认模板；纸面契约暂视为 core。
- 外部插件数据集中、LAN 鉴权仍未做。
- 构建期插件没有 iframe/Worker 沙箱；权限隔离是能力边界，不是安全边界。
