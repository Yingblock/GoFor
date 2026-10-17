# GoFor

> 面向中国高中生的**离线优先**学习辅助工具。  
> **纸是主输入端**：每日闭环在纸上完成，屏幕只做「拍照回填」和「每周收银」。

## 现在到哪了

**P0 地基已完成，P1 离线核心尚未开始。** 当前可以真实使用的最小闭环是：

> 在 App 里记作业 → 点专注格 → 把「我的一天」打印成一张 A4 纸

已经能用：

- **今日作业清单**：新增、勾选完成、删除，刷新不丢
- **专注格**：按科目点格子记学习时长，一格几分钟由作息表推导
- **纸面预览与打印**：A4 / A5 切换、自动分页、溢出提示、打印前检查提示
- **命令面板**：`Ctrl/⌘ + K`，打印、切换纸张、导出 / 导入 JSON
- **本地持久化**：Dexie (IndexedDB)，含配置迁移与默认科目播种
- **PWA**：可安装、离线打开；Service Worker 只在生产构建注册
- **JSON 全量导出 / 导入**：合并式导入，带格式版本校验

还没做：番茄钟、课表、模板编辑器、扫码回填、错题本 / SRS、笔记、同步、AI。
完整阶段见 [`docs/ROADMAP.md`](docs/ROADMAP.md)，当前状态见 [`docs/STATE.md`](docs/STATE.md)。

## 快速开始

要求 Node.js >= 22、pnpm 12。

```bash
pnpm install

pnpm dev         # 开发服务器，默认 http://localhost:5173
pnpm test        # 单测（core + store）
pnpm typecheck   # 全量类型检查
pnpm build       # 构建 PWA 产物到 apps/web/dist
pnpm e2e         # 真实浏览器冒烟，需先 build；生成 e2e/out/day-sheet.pdf
pnpm check       # Biome 自动修复
pnpm verify      # typecheck + test + build + e2e
```

打印时请确认：**缩放 100% · 关闭页眉页脚 · 勾选「背景图形」**。  
否则毫米版式会跑偏，或浅色格线直接丢失。

## 仓库结构

```
apps/web            PWA 宿主（Vite + React + Tailwind）
                    android/ 为 Capacitor 验证壳，不含原生能力
packages/core       纯领域逻辑：Clock / 配置 / 纸面时间解析 / 打印版式 / 实体
packages/store      Dexie 实现（浏览器专用）
e2e/                Playwright 真实浏览器冒烟
docs/               STATE / ROADMAP / DESIGN / WORKFLOW / LATER / DECISIONS
tools/              一次性打包实验（Windows 便携版）
```

`packages/ui`、`packages/vision`、`packages/plugin-api` 是规划中的共享包，尚未建目录。

技术栈与硬性约定见 [`AGENTS.md`](AGENTS.md)：TypeScript strict、pnpm workspaces、
React + Vite + Tailwind、Dexie、Vitest + Playwright、Biome。

## 平台策略

- **PWA 是主渠道**：Windows / Linux / macOS / 手机浏览器，一个 URL 即用
- **Android**：Capacitor 壳只用于验证；UsageStats、前台服务、Widget 等原生能力属于 P6
- **Windows 便携版**：Electron 壳是一次性验证，不是正式分发方案

## 文档

| 文档 | 用途 |
|---|---|
| [`docs/STATE.md`](docs/STATE.md) | 唯一真相源：现在在哪、下一步做什么 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | P0–P8 阶段、工时、验收标准 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 产品与技术设计、纸张优先设计律 |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Issue / Milestone / 每周复盘纪律 |
| [`docs/LATER.md`](docs/LATER.md) | 想法停车场：新想法先写这里 |
| [`docs/DECISIONS/`](docs/DECISIONS/) | 架构决策记录（ADR） |
