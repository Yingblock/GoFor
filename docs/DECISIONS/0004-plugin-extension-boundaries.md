# 0004 — 插件扩展的三条边界：数据互访、独占页面、UI 改动

日期：2026-10-30
状态：**已实现（2026-10-30）**；运行时单文件插件部分已被 `0007` 取消；落地取舍见 `0005`
相关：`docs/ROADMAP.md` P3-3.9 / 3.10 / 3.11；`docs/DESIGN.md` §2（信息架构与导航）、§11（数据安全与故障兜底）；
`docs/STANDARD.md` 规则 13（按阶段编码）、规则 8（UI 走 token）、规则 10（别重复造轮子）

## 背景

用户对 P3 提出三条超出"插件能装进来"的诉求：

1. 插件之间能互相交互（例：周总结模块读其他插件的数据）；
2. 允许插件改动系统 UI（布局插件、美化插件）；
3. 允许插件注册独占页面（新功能占满一整个页面）。

这三条都落在 P3，但 ROADMAP 的 3.1–3.8 只写了"视图槽位"，没说清权限边界。
不先把边界钉死，后面每加一个插件都要重新谈一次，而且很容易把既有承重契约搞坏。

## 决定

### 1. 插件之间只能通过「数据能力契约」交换数据（P3-3.9）

```ts
interface DataContract {
  id: string;        // 点分命名：sessions.daily / wordbook.progress
  version: number;   // 破坏性变更 +1；结构性变更换 id
  summary: string;   // 安装页给用户看的白话
  query(input: unknown): Promise<unknown>;  // 只读，返回可结构化克隆的 plain JSON
  revision(): Promise<number>;              // 宿主缓存键，避免周报每次全表扫
}
```

- manifest 声明 `provides.data` / `consumes.data`（`optional` 可选）。
- 解析顺序：**core 内置 provider > 已启用插件的 provider > null**。
- **core 的数据也必须走同一套**（学习时长 / 打卡 / 作业 / 三格自评做成内置 provider），
  否则"读 core"和"读插件"是两套逻辑，权限与降级语义必然分叉。
- 事件总线只广播"变了"，载荷只放 id、不放数据快照——同一份数据不能有两个真相。

### 2. 独占页面 = 注册项 + 最小 hash 路由（P3-3.10）

- `screen` 贡献项带 `layout: 'content' | 'full'`、`chrome: 'default' | 'none'`、懒加载 `load()`；
  id 用 `<pluginId>/<screenId>` 命名空间。
- 现在导航是 `useState<ScreenId>('home')`、没有 URL，所以补 `#/s/<id>` 手写路由（约 40 行），
  **不引 react-router**：只需要"刷新保持 / 后退 / 深链"三件事，平台能力够用。
- 禁用或卸载插件时，若用户正停在它的页面上 → 自动回首页并清边界错误；`load()` 失败 →
  边界显示"插件 X 加载失败"，不白屏。
- `chrome:'none'` 只隐藏外壳，**不得**把 `PrintLayer` 放进 `.screen-only`（P1 打白纸事故）。

### 3. UI 改动分三档，**不做**任意 DOM 接管外壳（P3-3.11）

| 档 | 能力 | 边界由谁保证 |
|---|---|---|
| 1 | 主题 token 包（颜色/圆角/字号/动效） | 宿主写进屏幕层容器的 CSS 变量；纸面色是硬编码，插件没有路径改到纸上 |
| 2 | 命名插槽（`home.after-stats` / `app.header.right` / `app.sidebar.footer` / `screen.<id>.after`）+ shell 变体（`compact` / `sidebar-right` / `focus`） | 插件只在宿主给的盒子里渲染；盒子天然继承 `ScreenBoundary`、深色 token、360px 约束 |
| 3 | 作用域 CSS（`@media screen` + `@scope ([data-plugin-surface="<id>"])`） | 强制限屏幕层；卸载即移除；老内核降级为 Shadow DOM 容器 |

用户 2026-10-30 明确选择"档 1+2+3 都要，但不给任意 DOM"。

## 否决的替代（以及为什么）

| 方案 | 否决理由 |
|---|---|
| 插件 A 直接读 `pluginData` 里 B 的键 | B 禁用/卸载后 A 静默读到空 → "周报显示本周 0 分钟"，与"打印时现算坐标"是同一类静默错数据；且权限模型无法表达"能读 B 的哪些字段"；B 在 Worker 里时根本读不到 |
| 用事件总线传数据 | 事件是"发生过"，不是"现在是什么"；订阅者会持有过期快照，且新装的插件拿不到历史 |
| 每个插件给一套自由 DOM（整壳可替换） | 会破坏 `.screen-only` / `.print-root` 分离（打白纸）、深色纸面约束、a11y 与 360px 不溢出；卸载后无法还原；出事无法定位 |
| 用 react-router 做路由 | 只需要 hash 三件事，多一个依赖与一层约定（`docs/STANDARD.md` 规则 10：先看平台能力） |
| 插件自由 `import '@gofor/ui'` | 运行时安装的单文件插件没有打包器、没有 import map；只能用宿主注入的 `window.GoForSDK`（见 P3-3.5） |

## 影响

- ROADMAP P3 新增 3.9（2 轮）/ 3.10（2 轮）/ 3.11（3 轮）/ 3.12（2 轮，插件数据层），共 9 轮；
  P3 合计 **30 轮**（P3a 16 + P3b 14）。估算单位已从工时改为对话轮数（2026-10-30，见
  `ROADMAP.md` 顶部）：1 轮 = 一次请求内能完成并自检的改动。
- 需要先做的前置改造：`App.tsx` 的 switch → 注册表、`nav.ts` 的 `ScreenId` union →
  "core 条目 + 注册表条目"，这也是 3.3 的一部分。
- 验收标准见 ROADMAP 三行；其中"装/卸插件时消费方不崩、不显示 0"和"启用主题包后
  `day-sheet.pdf` 体积与 `.print-page` 颜色不变"要进 e2e。

## 未决

- `DataContract` 是否允许插件做**同步**查询（现在定为 Promise，统一异步）；
- 主题包是否需要"按页面生效"（现在全局唯一一个，切换即整站）；
- `@scope` 之外的老 WebView 降级到 Shadow DOM 时，`@gofor/ui` 的类名样式如何注入
  （`adoptedStyleSheets` 需要把构建后的 CSS 传进影子树），P3-3.11 开工时再定。

## 明确不做

- 不做插件间直接存储访问；
- 不做任意 DOM 接管外壳；
- 不做服务端 / 网络插件能力（`network` 权限留给 P7 的 AI 与连接器，默认关闭）。
