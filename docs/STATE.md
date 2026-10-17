# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P0 地基 —— 已完成 4/7，剩下 Dexie / PWA / 命令面板。**

已完成（`pnpm verify` 全绿）：

- ✅ pnpm workspace 多包结构（`apps/web`、`packages/core`）
- ✅ TypeScript 7.0.2 strict（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- ✅ React 19 + Vite 7 + Tailwind 4 + Biome 2
- ✅ `@gofor/core` 的 `Clock` 抽象（系统时钟 / 手动时钟）与 `newId`，7 个单测通过
- ✅ dev server 可用（`host: true`，手机可局域网访问）

环境：Node 22.23.2 / pnpm 12.4.1 / Debian 13。Rust、Java 未安装（P5 之后才需要）。

## 下一步做什么（按顺序，做完一条划掉一条）

1. **Dexie 数据层**：`packages/core/src/db/` —— schema v1、迁移器、仓储层、一个 React hook
2. **PWA**：manifest + service worker + 图标，确认手机上能"添加到主屏"
3. **命令面板骨架**（Ctrl+K，占位命令即可）

## 什么坏了 / 什么没做完

- 无已知问题。`dist/` 未纳入 git（已 ignore）。
- 注意：仓库根目录同时有 `typescript@7.0.2`，**不要**在子包里再装别的 TS 版本。

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

P0 骨架落地，首个 commit `ae0f738`。
