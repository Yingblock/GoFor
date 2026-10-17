# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P0 地基 —— 已完成 4/7，剩下 Dexie / 配置持久化 / PWA / 命令面板。**

已完成（`pnpm verify` 全绿，59 个单测通过）：

- ✅ pnpm workspace 多包结构（`apps/web`、`packages/core`）
- ✅ TypeScript 7.0.2 strict（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- ✅ React 19 + Vite 7 + Tailwind 4 + Biome 2
- ✅ dev server 可用（`host: true`，手机可局域网访问）
- ✅ **`Clock` 抽象**（系统时钟 / 手动时钟）与 `newId`，7 个单测
- ✅ **打印版式引擎**（`packages/core/src/print/`，19 个单测）：
  - 纸张尺寸（mm，非 px）+ 12 列网格 + 固定高度区块（不做自动撑开）
  - `layout()` 纯算术排版、自动分页、超页告警；`normalizePlacement()` 出回填坐标
  - **实测：完整混合版需 A4，A5 只放得下精简版**（194mm 可用高度）
- ✅ **纸面时间解析**（`packages/core/src/paper/`，16 个单测）：
  - `parseTimeRange()` 容错解析手写 `19:30` / `1930` / `19点30分` / `19:30~20:15` / 跨零点
  - 歧义靠版面（上午/下午/晚上分栏）消除，解析不出来就失败、不猜
- ✅ **配置层**（`packages/core/src/config/`，17 个单测）：
  - zod schema + 出厂默认值 + 深合并 + 校验
  - `derivePeriodMinutes()` 从作息表推课时（取中位数，不受早读异常段干扰）
  - `resolveUnitMinutes()` / `minutesForCells()` / `cellsForMinutes()` 做专注格换算

环境：Node 22.23.2 / pnpm 12.4.1 / Debian 13。Rust、Java 未安装（P5 之后才需要）。

## 下一步做什么（按顺序，做完一条划掉一条）

1. **Dexie 数据层**：`packages/core/src/db/` —— schema v1、迁移器、仓储层、一个 React hook
2. **配置持久化**：把 `AppConfig` 存进 Dexie，加 `schemaVersion` 迁移器，UI 只读展示
3. **PWA**：manifest + service worker + 图标，确认手机上能"添加到主屏"
4. **命令面板骨架**（Ctrl+K，占位命令即可）

## 什么坏了 / 什么没做完

- 无已知问题。`dist/` 未纳入 git（已 ignore）。
- 仓库内**只有一份 TypeScript（7.0.2，根目录）**，不要在子包里再装别的版本。
- `apps/web` 还没接 shadcn/ui 与路由（P0 0.2 的剩余部分）。

## 怎么跑起来

```bash
pnpm install
pnpm dev         # http://localhost:5173 ，同局域网手机可访问
pnpm test        # packages/core 单测
pnpm typecheck   # 全部类型检查
pnpm build       # 产物到 apps/web/dist
pnpm check       # Biome 格式 + lint（自动修复）
pnpm verify      # typecheck + test + build 三连
```

## 最近一次更新

落地配置层 + 纸面时间解析 + 打印版式引擎，59 个单测通过。
专注格与时间登记都已是普通 block，模板可自由拼装；模板编辑器 v0 已排进 P1（14h）。
