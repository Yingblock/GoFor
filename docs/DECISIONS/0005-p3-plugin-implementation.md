# 0005 — P3 插件化的实现取舍

日期：2026-10-30
状态：**已实现**（P3 全部 12 项）；运行时单文件加载已在 `0007` 取消，本文对应部分仅作历史
相关：`docs/ROADMAP.md` P3；`docs/DECISIONS/0004-plugin-extension-boundaries.md`；
`packages/plugin-api`、`packages/core/src/plugin`、`packages/store/src/{plugins,backup,providers}.ts`、
`apps/web/src/plugins/`

0004 定的是"插件能做什么、不能做什么"。这份记的是落地时**怎么做的、为什么这样做**，
以及哪些地方故意留了边界。

## 决定

逐条见 §1–§10（标题即决定，正文给理由与否决的替代）：契约零 React、内核与插件共用一张注册表、
hash 按片段编码、启用状态进 Dexie、插件数据单容器 + 备份切片注册表、注册期校权限但**不是沙箱**、
`revision()` 用内容指纹、转换任务走宿主白名单 Worker、UI 扩展三档、命令与快捷键单注册表。

## 影响

- `apps/web` 只剩外壳与注册表，功能页全部搬进 `packages/plugins`；
- Dexie 停在该版本不再加表：新增插件数据只加备份切片；
- 第三方写 core 仍无入口（需 core 校验的 service facade，见 0006 未做）；
- 权限是注册期契约，不是运行期隔离；插件是构建期受信代码。


## 1. 契约包不依赖 React

`packages/plugin-api` 里页面/插槽组件用结构类型
`PluginComponent<P> = (props: P) => unknown`，宿主渲染时再断言成 `ComponentType`。

理由：契约包要能被 Node 单测和 `packages/core` 的类型检查直接引用。如果它
`import type { ComponentType } from 'react'`，core 就得为一份类型引入 React 的
peer/dev 依赖；而这个仓库的 core 是"零 UI"的。

## 2. 内核页面与插件页面共用一张注册表

`ScreenEntry` 同时描述两类页面：

- 内核页面（home / capture / 番茄钟 / 课表 / 打印 / 扫描 / 数据）由 `App` 的
  renderer 表渲染，**保留原有 props 与数据流**；
- 插件页面只有 `load(): Promise<{default: Component}>`，由宿主懒加载。

P3-3.3 的"迁移"因此只迁了 5 个行为屏（环境清单 / 三格自评 / 自我周报 / 情绪日记 /
自助工具箱）+ 单词库。番茄钟、课表、打印、扫描仍在内核，但它们在侧栏、命令面板、
路由里走的是**同一张注册表**——没有第二套导航。

## 3. hash 路由按片段编码

`#/s/<id>`。插件页面 id 是 `<pluginId>/<screenId>`，**不能**对整段做
`encodeURIComponent`：那样会变成 `gofor.wordbook%2Fscreen`，地址栏不可读，
e2e 也容易把"编码差异"误判成"路由没生效"。

`formatScreenHash` 先按 `/` 切片、逐段编码再拼回；解析时整段 decode。
刷新保持、后退有效、`gofor://` 可以指到插件页。

## 4. 启用状态在 Dexie，配置只放设置

- `plugins` 表：`{ id, kind: 'builtin' | 'installed', enabled, manifestJson, source, installedAt }`；
- `config.plugins.<id>.settings`：插件设置。

两者不能合并：安装页要在配置读取失败时也能展示/禁用插件；"是否启用"也只能有一个真相。
内置插件在启动时播种，**只补缺、不覆盖用户改过的 enabled**。

两个默认值例外：

- 主题包（`gofor.theme.sepia`）**默认关闭**——它一启用就改整站外观，应该是用户主动选的；
- 禁用的运行时插件**不 import**：`import()` 会执行模块顶层代码，禁用就该完全不跑。
  安装页仍从 `manifestJson` 展示它的名字、版本与权限。

## 5. 插件数据只有一个容器 + 备份切片注册表

Dexie v8 只加两张表：`plugins` 与 `pluginData`。插件数据行是
`{ id: '<pluginId>/<collection>/<key>', value: JSON }`。

- 插件**不能**自己开表：Dexie 版本号发布即冻结，让插件开表等于把版本管理交给第三方；
- 备份改成 `BACKUP_SLICES` 注册表，`exportAll` / `importAll` 不再硬编码 19 张表。
  新增表/插件数据只需加一条切片。P1 就在这里漏过 5 张表；
- 导出格式升到 **v2**（多 `plugins` / `pluginData`），v1 文件仍可导入（缺的切片记 0）。

## 6. 权限在注册时真的检查，但它不是沙箱

`registerScreen/Command/Slot/Theme/Css/Data/Converter/...` 会检查 manifest 声明的权限；
`storage` 与 `data.read` 不声明就拿不到对应能力。这解决的是"安装页能说清、插件不能
悄悄多注册一个入口"。

插件在页面主线程执行，能碰 DOM/IndexedDB。文档与插件目录必须明说"不是沙箱"；
不做 JS 隔离（PWA 没有可用的沙箱原语，Service Worker/Worker 渲染不了 React）。

## 7. 数据契约的 revision 是内容指纹

`DataContract.revision()` 返回行数 + 内容 hash。宿主当前**不做跨会话缓存**，
所以正确性优先：改了某一行、时间戳没变也能让 revision 变。
表都在本地、量级几百到几千行，代价可接受；真成瓶颈再改成基于索引的指纹（记在 LATER）。

插件拿不到 store：只通过 `ctx.data` / `host.data` 走契约。周报插件因此不 import
`@gofor/store` 也能出数；单词库缺省时显示「未安装」而不是 0 个词（3.9 验收）。

## 8. 转换器在 Worker 里跑，但任务 id 由宿主白名单

`startConverterRun` 把任务发给宿主内置 Worker，Worker 按 **任务 id 白名单** 分派
（目前只有 `markdown-to-text`），不 `eval` 插件源码。

- 超时 / 取消 / 崩溃 → `apps/web/src/plugins/converterRunner.ts` 映射到
  `packages/core/src/plugin/job.ts` 的状态机（三条路径都有单测）；
- 需要本机 Office/LibreOffice 的转换声明 `needsDesktopBridge`，PWA 下显示
  "网页版不能转换"，而不是转一半失败；
- 连接器契约已定，默认关闭（QQ 桥属 P7）。

## 9. UI 扩展三档都在宿主边界内

- **档 1**：主题 token 只允许 `--color|radius|shadow|text|duration|ease|spacing|font-*`，
  值里禁 `; { } @ < >`；只挂在 `.screen-only`，打印层在它外面；
- **档 2**：命名插槽（`home.after-stats` / `app.header.right` / `app.sidebar.footer` /
  `screen.<id>.after`）+ 三个 shell 变体（`compact` / `sidebar-right` / `focus`）；
  插槽自动包 `ScreenBoundary`；
- **档 3**：插件 CSS 由宿主包 `@media screen { @scope ([data-plugin-surface="<id>"]) { … } }`，
  卸载即移除 `<style>`；禁 `@import` / `</style>` / `javascript:` / 超长。

e2e 断言：启用主题后 `.screen-only` 的 `--color-paper` 变了、`.print-page` 的 color 仍是
`rgb(17,17,17)`、两次 `page.pdf()` 体积一致（130902 B）。

## 10. 命令与快捷键只有一个注册表

`HostCommand` 同时喂命令面板、全局快捷键与冲突检测。核心命令（`Mod+K` / `Mod+B` /
`Mod+P`）由 `App` 注册；插件命令在 activate 时注册。冲突在安装页列出，**不静默覆盖**。

## 明确的未做

- 插件签名/来源校验、沙箱、网络权限（后者默认拒绝，留给 P7）；
- `notebook` / `file-view` 只有契约与数据形状，没有编辑器 UI（P4/P5 再做，避免先写一版被推翻）；
- 主题包全局唯一一个；"按页面生效"与 `@scope` 之外的老内核降级（Shadow DOM）留在 LATER；
- 插件数据目前不加密、不压缩；备份里就是明文 JSON（与其它表一致）。
