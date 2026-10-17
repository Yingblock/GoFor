# AGENTS.md — 给 AI 助手的仓库约定

> 任何 AI 助手在动手前先读这个文件，再读 `docs/STATE.md`。
> 如果本文件与代码冲突，以本文件为准并提请修改本文件。

## 0. 长任务与多任务：必须开子代理（最高优先级，违反即返工）

这一条比下面所有规则都优先。历史教训：同一个错误犯过三次——
在主线里 `sleep` 等 gradle 下载（29 分钟）、把 `build && e2e && 截图` 串成一条命令、
在用户提醒之后又重复一次。结果都是：用户看不到进展、无法打断、上下文被日志淹没。

### 0.1 两条硬规则

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

### 0.5 两个自检问题

- **调用 bash 前**：这会不会超过 60 秒？会 → 后台或子代理。
- **开始一项子任务前**：还有别的能同时做的吗？有 → 现在就并行发出去。

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
| Android **增量**构建 | 2–5 min |
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
packages/ui       跨宿主组件（暂空）
packages/vision   CV：透视矫正、光照均衡、局部采样（暂空）
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
5. **每个 PR/提交都必须让 `pnpm test` 和 `pnpm typecheck` 通过。**
6. **不做门禁式功能**（"必须先写思路才能看解析"这类）。工具是降摩擦的。
7. **不做合规/隐私相关功能**，本阶段不处理。
8. **不要做 ROADMAP 当前阶段之外的功能**，新想法写进 `docs/LATER.md`。
9. 单个任务控制在 8 小时内；超了就拆。

## 存储约定

- **`liveQuery` 里只能只读**。任何写操作都会抛 `ReadOnlyError` 并白屏。
  需要「读+修复」的场景（如配置迁移）用 `currentConfigOrDefault`，且只在启动时调一次；
  运行期读用 `readConfig`。
- 打印层 `PrintLayer` 必须渲染在 `.screen-only` 之外，否则打印时被一起隐藏 → 白纸。

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
pnpm e2e            # 真实浏览器冒烟（需先 build），生成打印 PDF
pnpm verify         # 四连：typecheck + test + build + e2e
```

## 提交信息

Conventional Commits，**正文写"为什么"**：
`fix(pomodoro): 改用时间戳差值，避免后台节流导致计时漂移`
