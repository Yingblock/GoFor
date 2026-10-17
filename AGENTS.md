# AGENTS.md — 给 AI 助手的仓库约定

> 任何 AI 助手在动手前先读这个文件，再读 `docs/STATE.md`。
> 如果本文件与代码冲突，以本文件为准并提请修改本文件。

## 项目

GoFor —— 面向中国高中生的离线优先学习辅助工具。
**纸是主输入端**：每日闭环在纸上完成，屏幕只做"拍照回填"和"每周收银"。

## 技术栈（不要擅自更换）

- TypeScript strict，pnpm workspaces
- React + Vite + Tailwind CSS，UI 用 shadcn 风格（复制到仓库，不安依赖）
- 本地存储 Dexie (IndexedDB)；不要引入 Redux
- 测试 Vitest + Playwright
- 格式化/检查 Biome（`pnpm check`）
- 后端（远期）Hono + SQLite

## 目录

```
apps/web          PWA 宿主（Vite + React）
packages/core     纯领域逻辑：零 UI、零平台 API、零副作用
packages/ui       跨宿主组件（暂空）
packages/vision   CV：透视矫正、光照均衡、局部采样（暂空）
packages/plugin-api  插件契约（暂空）
docs/             STATE / WORKFLOW / ROADMAP / DESIGN / LATER / DECISIONS
```

## 硬性规则

1. **`packages/core` 不允许 import React、不允许碰 `window`/`document`/`indexedDB`。**
   时间、随机数、存储一律依赖注入（见 `packages/core/src/clock.ts`）。
2. **不要引入新依赖而不说明理由。** 优先用已有依赖或平台能力。
3. **每个 PR/提交都必须让 `pnpm test` 和 `pnpm typecheck` 通过。**
4. **不做门禁式功能**（"必须先写思路才能看解析"这类）。工具是降摩擦的。
5. **不做合规/隐私相关功能**，本阶段不处理。
6. **不要做 ROADMAP 当前阶段之外的功能**，新想法写进 `docs/LATER.md`。
7. 单个任务控制在 8 小时内；超了就拆。

## 领域约定

- 时间一律用 `Clock` 抽象，**禁止直接调用 `Date.now()` 或裸 `setTimeout`**。
  原因：番茄钟必须能在测试里被确定性地推进，且后台节流时不能漂移。
- 番茄钟用「时间戳差值」而不是「tick 累加」，避免后台定时器被节流导致计时变慢。
- ID 用 `newId()`，不要自己 `Math.random()`。

## 常用命令

```bash
pnpm install
pnpm dev            # apps/web 开发服务器
pnpm test           # 全部单测
pnpm typecheck      # 全部类型检查
pnpm check          # Biome 自动修复
pnpm verify         # 三连：typecheck + test + build
```

## 提交信息

Conventional Commits，**正文写"为什么"**：
`fix(pomodoro): 改用时间戳差值，避免后台节流导致计时漂移`
