# GoFor

> 面向中国高中生的**离线优先**学习辅助工具。  
> **纸是主输入端**：每日闭环在纸上完成，屏幕只做「拍照回填」和「每周收银」。

## 现在到哪了

**P0、P1、P2、P3、P3.5、P3.6 已完成。** 离线闭环已经能完整跑通：

> 在 App 里记作业 / 排课表 / 建打卡 → 打印「我的一天」→ 纸上手写打勾 →
> 拍照扫回来 → 逐条确认 → 写回本地数据库

当前验收**一律在网页上进行**，地址固定 `http://127.0.0.1:4173/`（systemd 用户服务
`gofor-preview` 托管，`pnpm build` 后刷新即可，不用重启服务）。

后续先人工把已有内容ui和逻辑打磨一下，调整一下默认插件列表，先不急着推进度了

ROADMAP要改。OCR提前做，能提升很大可用性也可以检测现有架构健壮性

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
- **插件化（P3–P3.6）**：`packages/plugin-api` 契约 + 宿主注册表；**除打印与基础设施外，
  所有功能页都是插件**——番茄钟 / 作业 / 课表 / 打卡 / 扫描 / 环境清单 / 三格自评 /
  自我周报 / 情绪日记 / 自助工具箱 / **单词库**；`#/s/<id>` 深链（刷新保持、后退）；
  插件是 **npm 包**（`@gofor/plugins`，随应用构建；无运行时单文件加载/`GoForSDK`）；
  插件互访走数据契约（缺失显示「未安装」，不显示 0）；主题 token / 命名插槽 + shell 变体 /
  作用域 CSS 三档 UI 扩展，**不给任意 DOM**；插件数据进 Dexie v8 + 备份切片注册表。
  **打印区块也有 owner**：插件禁用后区块静默跳过，预览下方提示「缺失 XX 插件」；
  模板「加区块」只列当前可用项；**扫描识别结果按 owner 交给对应插件处理**，缺插件不写库。
  打印/模板/校准、数据与备份、插件管理保留 core（纸面契约 + 引导悖论，见 `docs/DECISIONS/0006`）。
- **PWA**：可安装、离线打开；`Ctrl/⌘+K` 命令面板（内核 + 插件命令同一注册表）

还没做：错题本 / SRS、笔记 / 画板、Android 原生能力、同步、AI。
插件是**构建期受信代码**，随应用构建、没有运行时安装与沙箱隔离；`notebook` / `file-view`
只有契约、没有 UI（P4/P5），转换器只有 Worker 白名单任务（本机 Office 转换属 P5）。完整阶段见
[`docs/ROADMAP.md`](docs/ROADMAP.md)，当前状态见 [`docs/STATE.md`](docs/STATE.md)。

## 快速开始

要求 Node.js >= 22、pnpm。

```bash
pnpm install

pnpm dev         # 开发服务器（默认 http://localhost:5173）
pnpm build       # 构建 PWA 产物到 apps/web/dist（保留旧 assets；干净构建先 rm -rf apps/web/dist）
pnpm test        # 单测（core + store + vision + plugin-runtime + plugin-cli）
pnpm typecheck   # 全量类型检查
pnpm check       # Biome 自动修复
pnpm e2e         # 真实浏览器冒烟；需先 build 并启动 pnpm plugin:host；生成 e2e/out/day-sheet.pdf
pnpm verify      # typecheck + test + build + e2e（提交前必须全绿）

# 运行时插件（P3.7，见 docs/PLUGIN-RUNTIME.md）
pnpm --filter @gofor/plugin-runtime build
pnpm --filter @gofor/plugin-cli build
pnpm exec gofor plugin list --user-data /tmp/gofor-user
```

单测当前规模：**580 条**（core 253、domain 140、store 48、vision 46、plugin-runtime 18、plugin-host 2、plugin-cli 12、插件包 58、web 3）；e2e 约 **150 项**（`check()` 断言）
（条数会随当天数据的分支略有浮动）。

打印时请确认：**缩放 100% · 关闭页眉页脚 · 勾选「背景图形」**。
纸上的定位点/条码都是矢量绘制，但浅色格线仍依赖「背景图形」才能打印。

## 仓库结构

```
apps/web           PWA 宿主（Vite + React + Tailwind v4）
packages/core      纯原语 + 纸面契约：Clock / 配置 / 纸面时间解析 / 打印版式 / 扫描几何 / 插件解析
packages/domain    共享产品领域：课表 / 统计 / 打卡 / 番茄运行态类型（只依赖 core）
packages/store     Dexie 实现（浏览器专用，v1→v8 迁移）+ 内置数据 provider + 备份切片
packages/plugin-api 插件契约（零 React 依赖）
packages/plugin-kit 插件/宿主共享调试时钟、useHostData（打印模板解析/日期已进 core/print）
packages/plugins  聚合层（@gofor/plugins）：当前构建期插件 0 个（全部外置迁移中）
plugins/*         12 个插件源码包（当前由 external 构建工具打包，不再进 app 构建图）
packages/scan     core 打印回填页面/扫描流程（@gofor/scan；不是插件）
external-plugins/ `pnpm plugins:build` 生成的外部插件包（已 ignore）
packages/contracts 运行时插件契约（GoForPluginAPI / PluginManifest / PluginStatus，零依赖）
packages/plugin-runtime 主进程运行时加载器（userData/plugins、超时、隔离、日志、IPC）
packages/plugin-host   本地插件宿主（阶段一：0.0.0.0:47822，仅 loopback；PWA/LAN 后续接）
packages/plugin-cli    `gofor plugin add/remove/list`
apps/desktop      最小 Electron 主进程（运行时插件宿主；PWA 仍是主渠道）
examples/gofor-plugin-hello 独立示例插件（不在 workspace）
packages/ui        跨宿主组件（Button / Card / Modal / Slider …）+ token 样式
packages/vision    纯图像算法：灰度 / Otsu / 二值化 / 单应矫正 / 找纸 / 定位点 / 墨迹占比
e2e                Playwright 真实浏览器冒烟
docs               STATE / STANDARD / ROADMAP / DESIGN / DESIGN-SYSTEM / WORKFLOW / PLUGINS / PLUGIN-RUNTIME / LATER / DECISIONS / Phase-note
tools              一次性打包实验（已停用，见「平台策略」）
```

技术栈与硬性约定见 [`AGENTS.md`](AGENTS.md)：TypeScript strict、pnpm workspaces、
React + Vite + Tailwind（CSS-first `@theme`）、Dexie、Vitest + Playwright、Biome。

## 删除任意插件后的测试

构建期插件由 Vite 的 `import.meta.glob` 自动发现，删目录后直接构建即可：

```bash
pnpm install                 # 完整目录时先装
rm -rf plugins/mood          # 删任意一个插件目录
pnpm build
PORT=4174 ./plugin-test.sh --preview   # 可选：纯 node + Vite 直连构建并预览
```

细节见 [`docs/PLUGIN-TEST.md`](docs/PLUGIN-TEST.md)。

## 外部插件（运行时）

当前 12 个原构建期插件已外置迁移（`BUILTIN_PLUGINS=[]`）；由本地 plugin-host 加载。

```bash
pnpm plugins:build                    # 12 个插件源码 → external-plugins/ 外部包
pnpm plugins:install                  # 安装到 userData/plugins，并写入 enabled
pnpm --filter @gofor/plugin-runtime build
pnpm --filter @gofor/plugin-host build
pnpm plugin:host                      # 0.0.0.0:47822，阶段一只接受 loopback
# 4173 → 插件与扩展 → 启用外部插件（或 ?external=1）
```

用户决定哪些插件放回构建期后，再从 `plugins/*` 重新登记；当前全部在外部。

详见 [`docs/PLUGIN-HOST.md`](docs/PLUGIN-HOST.md)。

## 平台策略

- **PWA 是主渠道**：Windows / Linux / macOS / 手机浏览器，一个 URL（固定 4173）即用
- **不再构建 Windows 包**（用户 2026-10-20 决定）：`release/` 里的旧 zip 只作历史，
  不再重建、不再更新校验值；验收一律在网页上进行
- **Android 后期适配**：Capacitor 壳只用于验证；UsageStats、前台服务、Widget 等属于 P6

## 文档

| 文档 | 用途 |
|---|---|
| [`docs/STATE.md`](docs/STATE.md) | 唯一真相源：现在在哪、下一步做什么 |
| [`docs/STANDARD.md`](docs/STANDARD.md) | 开发规范与硬性规则 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 阶段、轮数、验收标准 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 产品与技术设计、纸张优先设计律 |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | 设计 token 与 `@gofor/ui` |
| [`docs/Phase-note/`](docs/Phase-note/) | 各阶段引入的特性与规则笔记 |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | Issue / Milestone / 每周复盘纪律 |
| [`docs/LATER.md`](docs/LATER.md) | 想法停车场：新想法先写这里 |
| [`docs/PLUGINS.md`](docs/PLUGINS.md) | 插件开发指南：manifest / 能力 / 数据 / 分发 |
| [`docs/DECISIONS/`](docs/DECISIONS/) | 架构决策记录（ADR） |
