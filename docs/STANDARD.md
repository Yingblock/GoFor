# 开发规范

### 1. 架构相关
1. **`packages/core` 不允许 import React、不允许碰 `window`/`document`/`indexedDB`。**
   时间、随机数、存储一律依赖注入（见 `packages/core/src/clock.ts`）。
2. **`@gofor/core` 根入口只放无依赖原语**（时钟、ID）。配置走子路径 `@gofor/core/config`，
   避免只用到时钟的宿主把 zod 打进包。新增子模块时同样加子路径导出。
3. **配置项一律走 `packages/core/src/config`，禁止在业务代码里内联魔法数字。**
   判断标准：现实世界会变的（课时、纸张、阈值）→ 配置化；产品设计决定的（交互流程、数据模型）→ 不配置化。
4. 对于内容输入，优先考虑能否从现有内容推导，，制作自动补全逻辑的同时保留手动输入渠道（如计时器完成了30分钟的某学科计时 -> 学习记录该时段自动填写）
5. **不要引入新依赖而不说明理由。** 优先用已有依赖或平台能力。
   新增**运行时**依赖必须同步写进 `apps/web/public/THIRD-PARTY-NOTICES.txt`
   （组件、版本、许可证、用途 + 许可证全文），并随 `dist/` 一起分发；
6. **每个 PR/提交都必须让 `pnpm test` 和 `pnpm typecheck` 通过。**
7.   **新增页面/独立区块必须包 `ScreenBoundary`**（`apps/web/src/components/ErrorBoundary.tsx`）。否则可能导致局部错误影响整体运行
     `liveQuery` 只读这条规则必须遵守。
8. **UI 一律走 `@gofor/ui` 与 `@theme` token。** 新代码优先用 `packages/ui` 的组件；
    必须自定义样式时复用 token 生成的类名（`border-line`、`rounded-lg`、`shadow-card`、
    `text-body`、`duration-fast` 等），不要手写颜色/圆角/阴影/时长的魔法值。
    Tailwind v4 用 CSS-first 配置（`apps/web/src/styles.css` 的 `@theme`），**不要新建
    `tailwind.config.js`**。详见 `docs/DESIGN-SYSTEM.md`。
    **深色主题（P2-2.16）只覆盖 token**：不要写 `bg-white` / `border-black/10` 这类原生色，
    分别用 `bg-card` / `bg-card-soft` / `border-line` / `bg-strong` / `text-on-strong` /
    `bg-overlay` / `bg-scrim`；纸面（`.print-page`）固定白底黑字，不跟主题变。

### 2.开发规范相关
9. 填写任何表单/文件均简明扼要，用最少字数精准指出规范/要求，不写废话
10. **实现新功能前先找现成稳定方案，避免重复造轮子。**
    - 先查三处：平台内建 API（浏览器/Chromium/Node/系统）、仓库已有依赖、成熟开源库。
    - 再评估五件事：**许可证**（必须能随包分发，见规则 4）、维护状态与版本、
      包体积、离线可用性、目标平台覆盖（PWA / Electron / Android WebView），
      以及 `engines` 与本地/CI 的 Node 版本是否匹配。
    - 能复用就复用。确需自己写，必须在提交说明里写清"为什么现有方案不够"
11. **不考虑，不做门禁式功能**（"必须先写思路才能看解析"这类）。
12. **不考虑，不做合规/隐私相关功能**
13. **用户对内容无特定要求，仅要求实现某阶段内容时严格按 `docs/ROADMAP.md` 编码，不做任何当前阶段之外的功能。**
   - **动手前先定位**：在 ROADMAP 里找到这项工作对应的阶段与编号（例如 `P2-2.3`）。
     **ROADMAP对应阶段没规划的内容一律不做**
   - **用户临时提出的新功能：先核对 ROADMAP，不在当前阶段就先告诉用户**
     （说明它属于哪个阶段、大概成本），**经用户确认后正常实现**，
     并同步写进 `docs/ROADMAP.md`（阶段 + 编号 + 验收标准）。
     不允许不核对就开工，也不允许"先做后说"；确认过的就按正常功能交付。
   - 实现过程中提出的想法，一律先写进 `docs/LATER.md`，不写代码。
   - 汇报/提交时说明"对应 ROADMAP 哪一条"；对不上就停下来说明，不要先做后报。

14. 文件填写规范：
 - 和开发具体内容无关，需要AGENT长期遵守的内容放AGENT.md
 - 每个决策节点在/docs/DECISIONS下单独写一篇md，并在/docs/DECISIONS/ADR.md下添加本次决策的简洁概括，包含决策内容和决策原因及因该决策受影响的部分。
 - 每个开发阶段多出来的特性和文件记在/docs/Phase-note下相应文件夹下 md文件
 - ROADMAP记载每阶段开发任务；STATE记载当前开发阶段
 - /docs/CHAOS 下存放前期开发产生的不规范的文件。开工前将其中文件按现有文件规范整理，然后将其中文件移至/docs/DROP