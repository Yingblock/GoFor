# GoFor

> 面向中国高中生的**离线优先**学习辅助工具。  
> **纸是主输入端**：每日闭环在纸上完成，屏幕只做「拍照回填」和「每周收银」。

## 现在到哪了

**P0、P1、P2 已完成。** 离线闭环已经能完整跑通：

> 在 App 里记作业 / 排课表 / 建打卡 → 打印「我的一天」→ 纸上手写打勾 →
> 拍照扫回来 → 逐条确认 → 写回本地数据库

当前验收**一律在网页上进行**，地址固定 `http://127.0.0.1:4173/`（systemd 用户服务
`gofor-preview` 托管，`pnpm build` 后刷新即可，不用重启服务）。

已经能用：

- **番茄钟**：可自定义时长、全屏专注、单键分心记录、长按 5 秒放弃（进度条填充）
- **作业清单**：截止、必做/选做、子任务、标签池、上下移动、完成勾选
- **课表**：学期 / 作息表 / 科目 / 排课规则；周视图连堂合并；编辑模式点格加课、
  **点课程块换课**或删除；600ms 防抖自动保存；首页可写课程备注并印到纸上
- **每日打卡**：周几重复 / 起止日期；未来不渲染、过去只读；首页打卡提示
- **打印**：9 种纸张；5 个内置模板 + 校准页 + 自定义模板编辑器；
  **指定日期 / 范围批量打印**（默认明天，开始/结束/天数滑动条联动，每天独立预览，
  一次最多渲染 100 天、可加载更多）；应用内预览弹窗覆盖整个范围，可翻页；
  「继续打印」会先逐日固化坐标清单再进系统打印框
- **扫码回填**：二维码 + 页尾 Code 128 条码兜底；四角 3mm 定位块自动找纸（手动四角仍可兜底）；
  **每个区块印两个对角小十字**，扫描后按区块做局部平移/缩放校正；待确认页逐条勾选再写库
- **纸面行为层**：打卡行（全部打卡项、超 6 项自动换行）、三格自评 `ratingGrid`、
  环境清单、自助工具箱、情绪日记、自我周报
- **深色主题**：跟随系统 / 浅色 / 深色三态，全部走 token；纸面固定白底黑字
- **数据与备份**：JSON 全量导出/导入、备份提醒、存储持久化申请
- **PWA**：可安装、离线打开；`Ctrl/⌘+K` 命令面板

还没做：错题本 / SRS、笔记 / 画板、Android 原生能力、同步、AI。完整阶段见
[`docs/ROADMAP.md`](docs/ROADMAP.md)，当前状态见 [`docs/STATE.md`](docs/STATE.md)。

## 快速开始

要求 Node.js >= 22、pnpm。

```bash
pnpm install

pnpm dev         # 开发服务器（默认 http://localhost:5173）
pnpm build       # 构建 PWA 产物到 apps/web/dist
pnpm test        # 单测（core + store + vision）
pnpm typecheck   # 全量类型检查
pnpm check       # Biome 自动修复
pnpm e2e         # 真实浏览器冒烟，需先 build；生成 e2e/out/day-sheet.pdf
pnpm verify      # typecheck + test + build + e2e（提交前必须全绿）
```

单测当前规模：**459 条**（core 371、store 42、vision 46）；e2e 约 **114 项**浏览器断言
（条数会随当天数据的分支略有浮动）。

打印时请确认：**缩放 100% · 关闭页眉页脚 · 勾选「背景图形」**。
纸上的定位点/条码都是矢量绘制，但浅色格线仍依赖「背景图形」才能打印。

## 仓库结构

```
apps/web           PWA 宿主（Vite + React + Tailwind v4）
packages/core      纯领域逻辑：Clock / 配置 / 纸面时间解析 / 打印版式 / 课表 / 扫描几何
packages/store     Dexie 实现（浏览器专用，v1→v7 迁移）
packages/ui        跨宿主组件（Button / Card / Modal / Slider …）+ token 样式
packages/vision    纯图像算法：灰度 / Otsu / 二值化 / 单应矫正 / 找纸 / 定位点 / 墨迹占比
e2e                Playwright 真实浏览器冒烟
docs               STATE / ROADMAP / DESIGN / WORKFLOW / LATER / DECISIONS
tools              一次性打包实验（已停用，见「平台策略」）
```

技术栈与硬性约定见 [`AGENTS.md`](AGENTS.md)：TypeScript strict、pnpm workspaces、
React + Vite + Tailwind（CSS-first `@theme`）、Dexie、Vitest + Playwright、Biome。

## 平台策略

- **PWA 是主渠道**：Windows / Linux / macOS / 手机浏览器，一个 URL（固定 4173）即用
- **不再构建 Windows 包**（用户 2026-10-20 决定）：`release/` 里的旧 zip 只作历史，
  不再重建、不再更新校验值；验收一律在网页上进行
- **Android 后期适配**：Capacitor 壳只用于验证；UsageStats、前台服务、Widget 等属于 P6

## 文档

| 文档 | 用途 |
|---|---|
| [`docs/STATE.md`](docs/STATE.md) | 唯一真相源：现在在哪、下一步做什么 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | P0–P8 阶段、工时、验收标准 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 产品与技术设计、纸张优先设计律 |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Issue / Milestone / 每周复盘纪律 |
| [`docs/LATER.md`](docs/LATER.md) | 想法停车场：新想法先写这里 |
| [`docs/DECISIONS/`](docs/DECISIONS/) | 架构决策记录（ADR） |
