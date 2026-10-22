# AGENTS.md — 给 AI 助手的仓库约定

> 任何 AI 助手在动手前先读这个文件，再读 `docs/STATE.md`。
> 如果本文件与代码冲突，以本文件为准并提请修改本文件。

## 0. 长任务与多任务：必须开子代理（最高优先级，违反即返工）

这一条比下面所有规则都优先。历史教训：同一个错误犯过三次——
在主线里 `sleep` 等 gradle 下载（29 分钟）、把 `build && e2e && 截图` 串成一条命令、
在用户提醒之后又重复一次。结果都是：用户看不到进展、无法打断、上下文被日志淹没。

### 0.1 三条硬规则

1. **长等待**：预计超过 **60 秒** 的命令，不在主 session 里等。
2. **多任务**：手上有 **≥2 件互不依赖** 的事，**必须并行**——把长的那件丢给子代理，
   主线同时做另一件。**不允许串行排队。**

### 0.2 决策表

| 场景 | 正确做法 |
|---|---|
| 单条命令预计 > 60s（build / e2e / install / gradle / 截图 / 下载） | `run_in_background: true` 起后台作业，**立刻继续做别的事** |
| 需要"等某个条件成立"（文件出现、端口就绪、构建完成） | **子代理**内部轮询，主线完全不管 |
| 多步骤且中间可能失败、需要诊断重试 | **子代理**（它能自己修再报） |
| ≥ 2 件互不依赖的工作 | **同一轮里发出多个子代理**，不要一个个来 |
| **打包 / 发 Release / 全量 verify** | **一律子代理**，不要用后台作业顶替——后台作业仍占着主 session 的回合 |
| 预计 < 60s 的查询、读文件、小改动 | 主 session 直接做 |
| 不确定要多久 | **按长任务处理**（默认从严） |

### 0.3 怎么并行发起

一条消息里放多个 `subagent` 调用即可，它们会同时跑：

```
[subagent: 重建 Android APK]  [subagent: 重建 Windows 包]  [我: 写文档]
```

每个子代理的指令必须**自包含**：它看不到当前会话。

### 0.4 明确禁止

- 在主 session 里 `sleep 120` 等下载
- 一条命令串多个长步骤（`build && e2e && 截图`）
- "等结果回来再继续"——结果应该由子代理或后台作业**通知**回来
- 反复 `job_output` 轮询同一个作业
- 为了省事把长任务留在主线，理由是"它应该很快"
- 在主线跑 `pnpm e2e` / `pnpm verify` / 打包脚本（历史问题：e2e 被主线跑过多次，
  用户已经明确点名）

### 0.5 三个自检问题

- **调用 bash 前**：这会不会超过 60 秒？会 → 后台或子代理。
- **开始一项子任务前**：还有别的能同时做的吗？有 → 现在就并行发出去。
- **这是"苦力"吗**（构建、上传、批量验证、截图、e2e、打包、全量 verify）？
  是 → 子代理，不是我。
- **命令里出现 `e2e` / `verify` / `build.sh` / `gradle` / 下载？** 出现 → 绝不主线跑。

### 0.6 本仓库实测耗时（用来判断，不用猜）

| 操作 | 实测 |
|---|---|
| `pnpm test` | 0.3 s |
| `pnpm typecheck` | 2–5 s |
| `pnpm build` | 1–2 s |
| `pnpm e2e`（起浏览器 + PDF） | 15–30 s |
| Playwright 截图脚本 | 10–20 s |
| 首次安装 Playwright 浏览器 | 1 m 31 s |
| `pnpm install`（新增依赖） | 10 s – 1 m |
| Android **首次** gradle 构建 | 29 m 45 s |
| Android **增量**构建 | 8 s – 5 min |
| Electron 包重建 | 1–3 min |

> 注意：前四项看起来很快，但**它们经常被串在一起**，且首次执行会下载东西。
> 一旦一条命令里出现两个以上，就按长任务处理。

### 0.7 委派模板（复制改写）

```
目标：一句话说清交付物（文件路径 / 退出码 / 验证结论）
环境：JAVA_HOME / ANDROID_HOME / 代理变量 等
允许：可以做哪些操作
禁止：不要改哪些文件、不要 commit、不要重启哪个进程
超时兜底：等多久算失败、失败后要报告什么
报告：期望的字段列表（不要贴长篇日志）
```

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
                  子路径：./config（配置+zod）、./print（版式）、./paper（时间解析）、./domain
packages/store    Dexie 实现（浏览器专用），实现了 core 里的仓储接口
packages/ui       跨宿主组件（token 样式，19 个组件）
packages/vision   纯图像算法：灰度/Otsu/二值化/单应透视矫正/墨迹占比/找纸/定位点（零依赖，46 测试）
packages/plugin-api  插件契约（暂空）
e2e/              真实浏览器冒烟（Playwright），产物在 e2e/out/（已 ignore）
docs/             STATE / WORKFLOW / ROADMAP / DESIGN / LATER / DECISIONS
```

## 硬性规则

1. **`packages/core` 不允许 import React、不允许碰 `window`/`document`/`indexedDB`。**
   时间、随机数、存储一律依赖注入（见 `packages/core/src/clock.ts`）。
2. **`@gofor/core` 根入口只放无依赖原语**（时钟、ID）。配置走子路径 `@gofor/core/config`，
   避免只用到时钟的宿主把 zod 打进包。新增子模块时同样加子路径导出。
3. **配置项一律走 `packages/core/src/config`，禁止在业务代码里内联魔法数字。**
   判断标准：现实世界会变的（课时、纸张、阈值）→ 配置化；产品设计决定的（交互流程、数据模型）→ 不配置化。
   能从作息表/课表推导的，绝不让用户手填。
4. **不要引入新依赖而不说明理由。** 优先用已有依赖或平台能力。
   新增**运行时**依赖必须同步写进 `apps/web/public/THIRD-PARTY-NOTICES.txt`
   （组件、版本、许可证、用途 + 许可证全文），并随 `dist/` 一起分发；
   只写在 README 里不算履约。
5. **每个 PR/提交都必须让 `pnpm test` 和 `pnpm typecheck` 通过。**
6. **不做门禁式功能**（"必须先写思路才能看解析"这类）。工具是降摩擦的。
7. **不做合规/隐私相关功能**，本阶段不处理。
8. **严格按 `docs/ROADMAP.md` 编码，不做任何当前阶段之外的功能。**
   - **动手前先定位**：在 ROADMAP 里找到这项工作对应的阶段与编号（例如 `P2-2.3`）。
     **找不到编号 = 默认不做**，先停下来问，不要"看起来相关"就开工。
   - **用户临时提出的新功能：先核对 ROADMAP，不在当前阶段就先告诉用户**
     （说明它属于哪个阶段、大概成本），**经用户确认后正常实现**，
     并同步写进 `docs/ROADMAP.md`（阶段 + 编号 + 验收标准）。
     不允许不核对就开工，也不允许"先做后说"；确认过的就按正常功能交付。
   - **修 bug 可以，但必须能指出它破坏了 ROADMAP 里已有的验收标准**。
     不能借"顺手修"把新能力塞进来：新功能 = ROADMAP 里没有规划过的能力。
   - 实现过程中冒出的好想法，一律先写进 `docs/LATER.md`，不写代码。
   - 汇报/提交时说明"对应 ROADMAP 哪一条"；对不上就停下来说明，不要先做后报。
9. 单个任务控制在 8 小时内；超了就拆。
10. **新增页面/独立区块必须包 `ScreenBoundary`**（`apps/web/src/components/ErrorBoundary.tsx`）。
    根边界只能保证"不白屏"，按页包一层才能做到"这一页崩了，导航和其他页还能用"。
    边界兜不住事件处理器和异步回调里的异常，所以 `liveQuery` 只读这条规则仍然必须遵守。
11. **UI 一律走 `@gofor/ui` 与 `@theme` token。** 新代码优先用 `packages/ui` 的组件；
    必须自定义样式时复用 token 生成的类名（`border-line`、`rounded-lg`、`shadow-card`、
    `text-body`、`duration-fast` 等），不要手写颜色/圆角/阴影/时长的魔法值。
    Tailwind v4 用 CSS-first 配置（`apps/web/src/styles.css` 的 `@theme`），**不要新建
    `tailwind.config.js`**。详见 `docs/DESIGN-SYSTEM.md`。
    **深色主题（P2-2.16）只覆盖 token**：不要写 `bg-white` / `border-black/10` 这类原生色，
    分别用 `bg-card` / `bg-card-soft` / `border-line` / `bg-strong` / `text-on-strong` /
    `bg-overlay` / `bg-scrim`；纸面（`.print-page`）固定白底黑字，不跟主题变。
12. **实现新功能前先找现成稳定方案，避免重复造轮子。**
    - 先查三处：平台内建 API（浏览器/Chromium/Node/系统）、仓库已有依赖、成熟开源库。
    - 再评估五件事：**许可证**（必须能随包分发，见规则 4）、维护状态与版本、
      包体积、离线可用性、目标平台覆盖（PWA / Electron / Android WebView），
      以及 `engines` 与本地/CI 的 Node 版本是否匹配。
    - 能复用就复用。确需自己写，必须在提交说明里写清"为什么现有方案不够"
      （性能、体积、离线、许可不可用等），并补测试。
    - **反例（别再犯）**：手写 Code 128 解码要求条码几乎水平、模块 ≥4px，
      真实照片一斜就废，最后换回 ZXing。造轮子前先用**真实数据**跑一遍现成方案。

## CI（GitHub Actions）

硬性规则 5 现在有机器兜底了：`.github/workflows/verify.yml` 在 push 到 `main`、
每个 PR、以及手动触发时跑 `pnpm verify`（typecheck + test + build + e2e）。
e2e 是真实浏览器冒烟，会自己起 `127.0.0.1:4173` 的 preview 服务，所以 CI 里
先装了 Playwright 的 Chromium（带系统依赖）——Node 里测不出 IndexedDB、打印 CSS、
全屏遮罩这些东西。

- **红 = 阻塞合并。** 类型、单测、构建、e2e 任何一环挂了都算这次改动有问题，
  不是 CI 抽风。先在本地跑 `pnpm verify` 复现：本地和 CI 跑的是同一条命令，不用猜。
- **不要在没有绿的情况下合并。** PR 的 verify check 全绿再合，不要「先合再修」。
- CI 只做校验：不部署、不发 release、不读 secrets。

## 存储约定

- **`liveQuery` 里只能只读**。任何写操作都会抛 `ReadOnlyError` 并白屏。
  需要「读+修复」的场景（如配置迁移）用 `currentConfigOrDefault`，且只在启动时调一次；
  运行期读用 `readConfig`。
- 打印层 `PrintLayer` 必须渲染在 `.screen-only` 之外，否则打印时被一起隐藏 → 白纸。
- **Dexie 的版本号一旦发布就冻结。** 新增表必须新开 `version(N+1)`，
  绝不能往已有版本的 `stores({...})` 里加一行——Dexie 只按版本号决定跑不跑升级，
  停在旧版本的浏览器库不会补建表，运行时会直接报「表不存在」。
- **新增表必须同时进 `exportAll` / `importAll`。** 备份（一键导出 JSON）和迁移都靠这两个函数，
  漏一张表意味着"备份成功、恢复少一半数据"。加了表就在 `store.test.ts` 补一条往返用例。
- **数据只在本机时，任何"新存一类东西"的功能都要想一遍丢了怎么办。**
  现在的兜底是：启动时 `navigator.storage.persist()`、`backup.reminderDays` 到了提醒备份、
  导入导出有 e2e 覆盖。详见 `docs/DESIGN.md` §15。

## 打印与扫描（P2 之后新增）

- **打印层新增可勾选区块时，必须同时在 `packages/core/src/scan/manifest.ts` 里加切分。**
  否则纸上有格子、坐标清单里没有，扫回来就是"识别不到任何格子"，而且不会报错。
- **采样窗必须和渲染对齐**：坐标按内容区（`rows × 行高`）切，不含区块底部留白；
  渲染时行高要正好等于 `ROW_HEIGHT_MM` 并从块顶铺起。改渲染或改切分都要同步改另一边。
- **批量打印必须逐日构建、逐日固化清单**：`sheetManifests` 的键含日期；任何一处沿用“今天”
  都会让纸上二维码/内容与清单对不上。打印队列的每张纸用 `buildSheetForDate(date)`。
- **坐标清单在进入打印页时就固化**（`sheetManifests`，键 `模板@日期@纸张`），不要绑在
  「打印这一张」按钮上：用户经常直接按 Ctrl/⌘+P，那条路不会触发点击处理。
- **四角定位块（fiducial）的尺寸/位置是打印与扫描的共享契约**：`FIDUCIAL_SIZE_MM` /
  `FIDUCIAL_OFFSET_MM` / `FIDUCIAL_INSET_MM` 在 `core/print/blocks.ts`，打印在
  `PrintSheet`、检测在 `vision/fiducial.ts`、外扩在 `core/scan/fiducial.ts`。改任何一处
  都要同时改另外三个，否则自动框选会整体偏移。**上下内缩不对称**：下方定位点跟着页尾
  条码走（正文底部 + 1mm），但不越过页脚安全线（`fiducialFooterInsetMm`）——短模板上移，
  长模板留在安全线；页尾条码**位置本身不动**。每页的 `fiducialBottomTopMm` 必须写进
  坐标清单，扫描端按清单值外扩（首次用旧对称几何试读，清单值不同再矫正一次），
  不能再套「绕中心按 H/(H-11) 对称缩放」。
- **纸面需要实心墨块时一律用 SVG 矢量填充，不要用 `background`**：浏览器打印默认不印
  「背景图形」，`div + background` 只在预览里出现、纸上没有（定位点就踩过）。同理，
  e2e 要断言 `svg [data-fiducial]` 而不只是 `[data-fiducial]`。
- **区块小定位点（P2-2.17 v2）同样是一份共享契约**：位置由 `blockMarkCenters` 计算
  （上沿 5%、下沿 95%，印在 2mm 行距里，避开页尾条码与页面四角定位块），打印在 `PrintSheet` 的 `BlockMarks`、
  清单在 `manifest.ts` 的 `pages[].blocks[].marks`、扫描校正在 `pipeline.ts` 的
  `refineTargetsByBlockMarks`。小点必须是**十字**而不是实心方块：实心块的填充率会让
  页面四角的 `findFiducialQuad` 把它当候选；十字还会被 5mm 勾选框采样窗避开。
  旧清单没有 `blocks` 字段时扫描端直接跳过校正，不要因此报错。
- **`checkboxList` 的采样窗只覆盖勾选框（5mm）**，不要扩到整行：行里的印刷标题是墨迹，
  会把"没勾"读成"勾了"。`manifest.ts` 与 `PrintSheet` 的勾选框位置必须同时改。
- **二维码 ≥ 16mm**。12mm 在 300dpi 下每模块约 0.3mm，手机经常扫不出；
  e2e 用 4 倍像素密度截图当"照片"来验证整条链路。
- **二维码从整张照片解码，但必须按手动四角做位置校验**（允许 10% 外溢）：
  纸张尺寸写在码里，先裁框会循环依赖，所以解码只能全图做；代价是同一张照片里
  另一张纸/屏幕上的码会被当成这次的纸。解出后用码中心点比对四角外接矩形，
  明显在框外的码不认。
- **扫描只采样二维码所在的那一页**（现在固定第 1 页）。把所有页的 target 摊到一张
  照片上采样，第 2 页起的坐标会落到第 1 页的纸上，而且不会报错——静默错数据。
- **页尾条码是兜底，不是替代**（P2-2.12）：载荷只有短码（日期 + 纸张 + 模板短码 +
  页号），由 `PrintSheet` 统一画在页边距里——**不要**做成模板区块，否则用户模板会漏印。
  短码格式/纸张编码改动必须同时改 `core/scan/barcode.ts` 与 `PrintSheet` 的渲染，
  e2e 的"隐藏二维码只靠条码"用例会兜住。
- **打卡行（habitRow）的采样窗只覆盖勾选框**：习惯名是印刷字，采样窗套住名字会把"没勾"读成有墨。
  `manifest.ts` 的 `habitRowTargets` 与 `PrintSheet` 的 `HabitRowView` 必须同时改（窗宽 5mm/行高 7mm）。
  打卡项超过 6 个会换行：行数由 `materialize()` 按当天打卡项数量算好（`habitRowLayout` 均分、差 ≤1），
  渲染与切分**共用同一个布局函数**，改一边必须同步另一边；名字过长用省略号，不能溢出到相邻格子。
  A5 等高度 <230mm 的小纸会自动不印这一行，别为了"都能印"把整页顶成两页。
- **手写内容不做识别**：时间登记、`slots` 手写格需要 OCR，P2 明确不做；
  要回填的数值请用 `ratingGrid`（印成勾选格）。

## 本地服务与壳

- **承载应用的本地服务端口必须固定**（Electron 壳、preview、任何静态服务）。
  IndexedDB / localStorage 按 origin 隔离，端口一变数据就"消失"——Windows 壳曾经用
  `listen(0)`，用户看到的现象就是"关掉窗口全丢"。固定端口 + 单实例锁是底线。
- 用户可见的「导出/导入备份」入口不能只藏在命令面板里：丢数据时没人会去按快捷键。
  现在的入口是「数据与备份」页 + 备份横幅上的「从备份导入」。

## 领域约定

- 时间一律用 `Clock` 抽象，**禁止直接调用 `Date.now()` 或裸 `setTimeout`**。
  原因：番茄钟必须能在测试里被确定性地推进，且后台节流时不能漂移。
- 番茄钟用「时间戳差值」而不是「tick 累加」，避免后台定时器被节流导致计时变慢。
- ID 用 `newId()`，不要自己 `Math.random()`。

## 打包策略

- **不再构建 Windows 包**（用户 2026-10-20 决定）：`tools/package-windows/build.sh` 与
  `release/GoFor-win-x64.zip` 不再是交付物，`release/` 里的旧包只作历史，**不要重建、不要更新校验值**。
- **验收一律在网页上进行**：改完 `pnpm build`（或 `pnpm verify` 里的 build）让 4173 的
  `vite preview` 读到新 `dist`，在 `http://127.0.0.1:4173/` 上点一遍验收；需要自动化时用 e2e。
- Android（Capacitor + gradle）同样不打，等后期适配。
- `release/` 仍不进 git（已 ignore）；**发布 GitHub Release 必须用户明确要求**，默认什么包都不构建。
- **4173 由 systemd 用户服务托管，不要再用 `pnpm preview &` / `nohup` 临时起**：
  `~/.config/systemd/user/gofor-preview.service`（`Restart=always`、已 `enable`，
  用户 `Linger=yes`，所以关终端/WSL 会话结束都不影响）。
  - **必须 `--host 127.0.0.1`**（unit 里已写）：WSL2 的 Windows 端口转发按绑定族镜像，
    绑 `0.0.0.0` 时 Windows 侧只开 `[::1]:4173`，浏览器用 `127.0.0.1` 会连不上；
    绑 IPv4 环回后 Windows 才是 `127.0.0.1:4173`（`localhost` 也可用）。
  - 重建 dist 后**不用重启服务**（`vite preview` 每次请求读磁盘）；
  - 换 node 版本后改 unit 里的绝对路径，再 `systemctl --user daemon-reload && systemctl --user restart gofor-preview`；
  - 看状态/日志：`systemctl --user status gofor-preview` / `journalctl --user -u gofor-preview -f`。
  - 地址固定 `http://127.0.0.1:4173/`；不要用随机端口（IndexedDB 按 origin 隔离）。

## 常用命令

```bash
pnpm install
pnpm dev            # apps/web 开发服务器
pnpm test           # 全部单测
pnpm typecheck      # 全部类型检查
pnpm check          # Biome 自动修复
pnpm e2e            # 真实浏览器冒烟（需先 build），生成打印 PDF
pnpm verify         # 四连：typecheck + test + build + e2e
```

## 提交信息

Conventional Commits，**正文写"为什么"**：
`fix(pomodoro): 改用时间戳差值，避免后台节流导致计时漂移`
