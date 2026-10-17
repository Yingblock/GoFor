# 0001 — Monorepo + TypeScript 全栈

日期：2026-xx
状态：已接受

## 背景

单人开发，20 hrs/week，需要同时覆盖 PWA / Android / （可选）桌面。
核心域逻辑（番茄钟、课表、SRS、同步）必须与 UI 和平台解耦，否则后面换宿主会重写。

## 决定

1. 用 **pnpm workspaces** 单仓多包，`apps/` 放宿主，`packages/` 放共享代码。
2. 全栈 **TypeScript**，`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`。
3. 共享包**不预编译**，`exports` 直接指向 `./src/index.ts`，由 Vite/Vitest 即时转译。
   理由：单人项目不需要构建编排，省掉 turbo/tsc -b 的复杂度；类型检查用独立的 `typecheck` 脚本。
4. `packages/core` **零 UI、零平台 API、零副作用**，只允许依赖注入（如 `Clock`）。

## 后果

- ✅ 加新宿主（Tauri）只需新建 `apps/desktop`，共享层不动
- ✅ 测试跑得飞快，不需要先 build
- ⚠️ 发布 npm 包时需要补构建步骤（本项目不需要）
- ⚠️ 依赖必须单一版本，pnpm 严格 node_modules 会暴露隐式依赖——这是好事

## 备选方案

- **Turborepo + tsc -b**：正确但过重，20 hrs/week 用不上
- **单包 + 目录分层**：简单，但后面 Android 宿主引入时会变脏
- **Flutter**：UI 与域逻辑耦合更紧，且桌面端弱
