# P1 · 数据安全与故障兜底

> P1 收尾补的承重件：功能完成后最大的问题不是功能，而是「数据只有一份、坏了就没了」。设计摘要见 `docs/DESIGN.md` §11。

## 三种丢法

| 方式 | 表现 | 性质 |
|---|---|---|
| 浏览器驱逐 | 磁盘紧张时静默清掉未持久化的来源数据（IndexedDB 在内） | 数据没了 |
| 清缓存 / 卸载 / 换设备 / 重装 | 本机存储没有第二份 | 数据没了 |
| 渲染崩溃 | 数据还在库里但界面进不去（`liveQuery` 里写库抛 `ReadOnlyError` → 白屏 → 用户只能清缓存） | 数据还在但用不了 |

前两种防「丢」，第三种防「打不开」，解法不同。

## 四道防线

| 防线 | 做法 | 防的是 | 落点 |
|---|---|---|---|
| 持久化存储 | 启动调 `requestPersistentStorage()`；已持久化不重复申请，不支持/拒绝/抛异常都静默 | 驱逐 | `apps/web/src/backup.ts`、`App.tsx` |
| 备份提醒 + 一键导出 | 距上次备份 ≥ `backup.reminderDays`（默认 7 天）出横幅，一键 `exportAll` JSON 并记 `lastAt`；横幅上直接给「从备份导入」 | 换设备/清缓存 | `BackupBanner.tsx`、`backup.ts` |
| ErrorBoundary + ScreenBoundary | 根边界显示错误摘要 + 重试 + 重新加载；按页包裹，切页自动清错误 | 白屏 | `apps/web/src/components/ErrorBoundary.tsx`、`main.tsx` |
| CI | push / PR / 手动触发跑 `pnpm verify`（typecheck + test + build + e2e） | 「提交必须绿」只靠自觉 | `.github/workflows/verify.yml` |

原则：提醒挡在视线里但不挡路。「今天不再提醒」写 localStorage，当天不再弹；不弹窗、不强制、不拦操作（`docs/STANDARD.md` 第 11 条）。屏幕崩了打印层仍然能打（`PrintLayer` 在 `.screen-only` 之外）。

## 备份必须完整

- `exportAll` 曾经漏 5 张表（打卡、打卡日志、课表、标签池、番茄运行）→ 导入导出改为**全量表**。
- 备份表清单由 `BACKUP_SLICES` 注册表维护，替代硬编码表名；新增表必须同时登记（`packages/store/src/backup.ts`），否则「备份成功、恢复少一半数据」。
- 旧备份文件缺字段按空数组兼容；格式 v2 兼容 v1。
- 证据：`store.test.ts` 往返用例真的建了 5 张表；e2e 断言备份文件含全部表。

## 没做的，以及为什么

**无人值守自动备份**（记入 `docs/LATER.md`）：浏览器里真正静默写盘只有 File System Access API，需要用户授权一次拿到目录句柄；Chrome/Edge 可用，Android WebView 与部分内核支持不一致；跨设备备份本来就要服务端（P7）。「提醒 + 一键」已覆盖主要场景，再往上做就变成自建同步服务，不是 P1 该做的事。

## 兜底的边界

- 边界**兜不住**事件处理器与异步回调里的异常（React 抓不到），只能在源头处理。
- 因此 `liveQuery` 只读规则仍必须遵守；需要「读 + 修复」用 `currentConfigOrDefault`，且只在启动时调一次。
- 新增页面/独立区块必须包 `ScreenBoundary`（`docs/STANDARD.md` 第 7 条），否则单页崩溃会拖垮导航。

## 验收证据（P1 收尾）

| 缺口 | 处理 | 证据 |
|---|---|---|
| 数据只在 IndexedDB | persist + 横幅 + 一键导出 | e2e：下载 → 结构 → lastAt → 横幅消失 → 再导入 → 坏文件 |
| `exportAll` 漏 5 表 | 全量导出导入、旧文件兼容 | store 往返用例；e2e 备份含全部表 |
| 渲染异常白屏 | 根 + 按页边界 | 临时注入异常 → fallback 出现 → 重试恢复 → 回滚 |
| 没有 CI | `verify.yml` | push / PR / 手动触发；真实 Chromium 跑 `pnpm verify`，并检查打印 PDF 不是白纸 |

当前验证口径见 `docs/STATE.md`：574 单测（含 domain 140、插件包 58）、约 150 项 e2e。
