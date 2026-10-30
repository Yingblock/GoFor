# 插件开发指南

> 面向给 GoFor 加功能的开发者。**本文讲构建期 UI 插件**（页面/主题/数据/打印归属）。
> 主进程运行时无头插件（命令/视图插槽/打印模板/任务读写）见 [`PLUGIN-RUNTIME.md`](PLUGIN-RUNTIME.md)
> 与 [`DECISIONS/0008`](DECISIONS/0008-runtime-plugins.md)。
> 构建期边界见 [`0004`](DECISIONS/0004-plugin-extension-boundaries.md)、
> [`0006`](DECISIONS/0006-all-features-as-plugins.md)、[`0007`](DECISIONS/0007-npm-only-plugins.md)；
> 规则清单见 §8；机器可读版是 `packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`。

## 1 插件 = npm 包，随应用构建

> 想测试「删掉任意插件后还能不能跑」：见 [`PLUGIN-TEST.md`](PLUGIN-TEST.md)，用
> `./plugin-test.sh`（不要直接 `pnpm build`，pnpm 会先校验缺失的 workspace 包）。

| 项 | 规则 |
|---|---|
| 位置 | 独立 workspace 包 `plugins/<plugin>/`（包名 `gofor-plugin-*`），由 `@gofor/plugins` 聚合 |
| 形态 | TypeScript 模块，导出 `PluginModule = { manifest, activate, deactivate? }` |
| 安装 | 随应用构建；没有运行时安装、Blob/`import()`、`window.GoForSDK`（运行时无头插件另见 `PLUGIN-RUNTIME.md`） |
| 更新 | 改代码 → `pnpm build` / 发版；开发期 `pnpm dev` 有 HMR |
| 启停 | 只切换注册表与 Dexie `plugins` 表的 enabled，**不删插件数据** |
| 信任 | 构建期受信代码，可 import `@gofor/core` / `@gofor/domain` / `@gofor/store` / `@gofor/ui` / `@gofor/plugin-kit` |

没有「用户粘贴单文件 JS」这条路：无法 typecheck、无法带依赖、也没有真正的沙箱；
需要新功能时加一个包内插件模块，并登记到 `packages/plugins/src/index.ts` 的 `BUILTIN_PLUGINS`。

## 2 最小插件

```ts
import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const helloPlugin: PluginModule = {
  manifest: {
    id: 'me.hello',
    name: 'Hello',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    permissions: ['ui.screen', 'command'],
  },
  activate(ctx) {
    ctx.registerScreen({
      id: 'me.hello/screen', // 必须 <pluginId>/<screenId>
      title: 'Hello',
      group: '离线·M1',
      icon: '👋',
      order: 100,
      layout: 'content', // content | full
      chrome: 'default', // default | none
      load: async () => {
        const module = await import('./Hello.tsx');
        return { default: module.HelloScreen };
      },
    });
    ctx.registerCommand({ id: 'me.hello/ping', title: 'Hello：打个招呼', run() {} });
  },
};
```

登记后即出现在侧栏、命令面板与 `#/s/<pluginId>/<screenId>`；新增插件**不需要改 `apps/web`**，
页面、命令、路由、打印归属都由注册表汇总。

## 3 manifest 与权限

| 字段 | 规则 |
|---|---|
| `id` | 小写点分，全局唯一，也是页面/命令/数据的命名空间 |
| `name` / `version` / `description` / `author` / `homepage` | 插件目录展示 |
| `apiVersion` | 必须等于宿主 `PLUGIN_API_VERSION`（当前 1），没有兼容层 |
| `permissions` | 见下；注册项在注册期真的检查 |
| `dependencies` | 硬依赖 `{ "other.id": "^1.0.0" }`；缺失/禁用/版本不符 → 不激活 |
| `optionalDependencies` | 可选依赖：只影响顺序与「未安装」提示，缺失不报错 |
| `provides` | 声明 screens / commands / data / themes / content / converters / **printBlocks** |
| `consumes.data` | `{ id, version, optional? }`，跨插件取数的唯一声明入口 |

权限清单（`packages/plugin-api/src/permissions.ts`）：

| 权限 | 白话 |
|---|---|
| `ui.screen` | 新增一个自己的页面（出现在侧栏） |
| `ui.slot` | 在首页/页头/侧栏的固定位置追加内容 |
| `ui.theme` | 改屏幕层主题 token（改不到纸上） |
| `ui.css` | 给屏幕层加作用域样式（只影响自己那块） |
| `command` | 往命令面板加命令与快捷键 |
| `data.read` | 读取其他插件或 core 提供的数据 |
| `data.provide` | 向其他插件提供只读数据 |
| `storage` | 在本机保存自己的数据（会进入备份） |
| `converter` | 注册文件转换器（Worker 或桌面桥） |
| `connector` | 注册外部连接器（默认关闭） |
| `scan.handle` | 接收扫描识别结果并写回自己的数据 |
| `ocr` / `ai` | 使用 OCR / AI provider（接口已定，宿主默认「未配置」） |
| `network` | 联网（本阶段宿主一律拒绝） |

## 4 能注册什么

| 注册项 | API / 声明 | 约束与落点 |
|---|---|---|
| 页面 | `registerScreen` | id `<pluginId>/<screenId>`；`#/s/<id>`；`layout` / `chrome` / `shell` / `order` |
| 命令 | `registerCommand` | 命令面板 + 快捷键（`Mod+K` 等），冲突由宿主检测（`findShortcutConflicts`） |
| 插槽 | `registerSlot` | `home.after-stats` / `app.header.right` / `app.sidebar.footer` / `screen.<id>.after` |
| 主题 | `registerTheme` | 只覆盖屏幕层 token；纸面固定白底黑字 |
| 作用域 CSS | `registerCss` | 宿主包 `@media screen { @scope ([data-plugin-surface="<id>"]) }` |
| 内容模块 | `registerContentModule` | `notebook` / `wordbook` / `file-view` + `search()`；`collections` 进备份 |
| 转换器 | `registerConverter` | 只能指定宿主 Worker 白名单任务或 `needsDesktopBridge` |
| 连接器 | `registerConnector` | 默认关闭，需要桌面桥 |
| 数据契约 | `registerData` | 只读；见 §5 |
| 扫描处理器 | `registerScanHandler` | id `<pluginId>/scan`；按 `owner` 路由；见 §6 |
| 打印区块归属 | `provides.printBlocks` | 只有构建期插件能声明，几何在 core；见 §6 |
| OCR / AI | `registerOcrProvider` / `registerAiProvider` | 接口已定，宿主默认「未配置」 |

`ctx` 另有 `data` / `storage` / `now` / `newId` / `log`；页面/插槽/命令 host 另有 `navigate` / `back` / `applyScan`。

## 5 数据契约

```ts
ctx.registerData({
  id: 'wordbook.entries',
  version: 1,
  summary: '单词库全部词条',
  query: async (input) => entries,
  revision: async () => fingerprint,
});
```

- 解析顺序 **core > 已启用插件 > 未安装**；缺失返回 `null`，界面显示「未安装」，不能当 0。
- 版本必须与 `consumes.data` 声明严格相等；破坏性变更 +1，结构性变更换 id。
- `revision()` 是缓存键，当前用内容指纹（正确性优先）。
- 禁止插件互读 `pluginData`：对方禁用后会静默读到空，不会报错。
- core 内置 provider（`packages/store/src/providers.ts`）：`sessions.range`、`subjects.all`、`habits.range`、`mood.range`、`diary.range`、`toolbox.recent`、`tasks.all`、`checklists.all`；完整契约表见 §8。

## 6 打印区块与扫描回填

- 区块归属写 `manifest.provides.printBlocks`（如 `['checkboxList']`）；只有构建期插件能声明。
- 打印/模板预览前 `resolvePrintBlocks` 跳过缺失插件的区块，模板页「加区块」只列当前可用（已启用插件 + core）的 kind。
- 插件禁用后区块在预览/打印里静默跳过，预览下方给「缺失 XX 插件」；**不画空框**。
- 坐标清单 target 带 `owner`，`ScanResult` 带 owner；宿主按 owner 调插件 handler。
- 缺插件/处理器抛错：确认页显示「缺失 XX 插件，N 项未回填」，**不写库、不标 applied**，可重试。
- 旧清单没有 owner 时按 `payload` 前缀回退（`task→gofor.tasks` 等）。
- 几何、模板、坐标清单、二维码/条码在 core；插件只声明区块归属，不能算坐标。

## 7 存储与备份

- 插件数据走 `ctx.storage`（`get/put/list/delete/clear`），落到 Dexie v8 `pluginData`：主键 `<pluginId>/<collection>/<key>`，值为 JSON 字符串。
- 集合名/键限制在安全字符（`assertPluginKey`）；插件**不能**自己开 Dexie 表——版本号发布即冻结。
- 禁用/卸载都**不清数据**；只有 `deletePluginRecord(..., { deleteData: true })` 才清（现在没有卸载 UI）。
- 导出备份包含 `pluginData`（格式 v2），导入合并；新增存储必须进 `BACKUP_SLICES`。
- 插件记录在 `plugins` 表（现在只有内置）；`source` 是旧运行时字段，不再读取。

## 8 规则清单与现有插件

机器可读 `packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`，人可读本文档 §8；`PLUGIN_RULES` 从 manifest 推导，新增/改插件必须同步这两处。

### 总则

1. 构建期插件是独立 npm 包 `gofor-plugin-*`（`plugins/<name>/`），由 `@gofor/plugins` 聚合；
   拆分/移动时保持 `id`、manifest、贡献项不变。
2. 构建期插件没有运行时单文件加载：没有 Blob/`import()`、`plugins.source` 写入、`window.GoForSDK`；
   主进程运行时插件是另一条平面（§9），不共享这套 manifest。
3. 页面/命令/插槽/主题/CSS/内容模块/转换器 id 一律 `<pluginId>/<xId>`；撞上 core 的 ScreenId union（`apps/web/src/nav.ts`）直接忽略并报冲突。
4. 权限在注册期检查；插件是构建期受信代码，没有沙箱这一层概念。
5. 插件之间只能通过 `DataContract` 交换数据；禁止互读 `pluginData`（对方禁用后会静默读到空）。
6. 数据只走 Dexie v8 `pluginData`（`<pluginId>/<collection>/<key>`）；禁用/卸载不清数据。
7. 打印区块归属与扫描回填的细节见 §6；只有构建期插件能声明，缺插件不写库、不标 applied。
8. 导航顺序用 `ScreenContribution.order`，不要依赖注册顺序；旧深链必须写进 `App.tsx` 的 `LEGACY_SCREEN_REDIRECTS`。
9. 页面一律懒加载（`load()`），宿主自动包 `ScreenBoundary`；`chrome:'none'` / `layout:'full'` 不能让打印层进入 `.screen-only`。

### 现有插件

| 插件 id | 名称 | 页面 | 权限 | 打印区块 | 扫描处理器 | 插槽 / 其它 |
|---|---|---|---|---|---|---|
| `gofor.pomodoro` | 番茄钟 | `gofor.pomodoro/screen` | `ui.screen` | — | — | — |
| `gofor.tasks` | 作业清单 | `gofor.tasks/screen` | `ui.screen`, `scan.handle` | `checkboxList` | `gofor.tasks/scan` | — |
| `gofor.timetable` | 课程表 | `gofor.timetable/screen` | `ui.screen` | `schedule` | — | — |
| `gofor.checkin` | 每日打卡 | `gofor.checkin/screen` | `ui.screen`, `scan.handle` | `habitRow`, `checkboxGrid` | `gofor.checkin/scan` | — |
| `gofor.scan` | 扫描回填 | `gofor.scan/screen` | `ui.screen` | — | — | — |
| `gofor.checklist` | 环境清单 | `gofor.checklist/screen` | `ui.screen` | — | — | — |
| `gofor.mood` | 三格自评 | `gofor.mood/screen` | `ui.screen`, `scan.handle` | `ratingGrid` | `gofor.mood/scan` | — |
| `gofor.report` | 自我周报 | `gofor.report/screen` | `ui.screen`, `data.read` | — | — | 消费 7 个数据契约（可选依赖 `wordbook.entries`） |
| `gofor.diary` | 情绪日记 | `gofor.diary/screen` | `ui.screen` | — | — | — |
| `gofor.toolbox` | 自助工具箱 | `gofor.toolbox/screen` | `ui.screen` | — | — | — |
| `gofor.wordbook` | 单词库 | `gofor.wordbook/screen` | `ui.screen`, `ui.slot`, `data.provide`, `storage` | — | — | 插槽 `home.after-stats`；提供 `wordbook.entries` |
| `gofor.theme.sepia` | 护眼主题 | — | `ui.theme`, `ui.slot`, `ui.css` | — | — | 插槽 `app.header.right`；默认禁用 |
| `gofor.convert` | 纯文本转换 | — | `converter` | — | — | Worker 任务 `markdown-to-text` |

共享产品域在 `@gofor/domain`（timetable / stats / habits / PomodoroRun 类型）；单插件专用逻辑
留在各自包内（番茄状态机、工具箱练习、单词库解析）。`@gofor/core` 只留原语、配置、纸面契约与插件解析。

每个插件对应一个独立 workspace 包（`plugins/<name>/`）：`gofor-plugin-checkin`、`-checklist`、
`-converter`、`-diary`、`-mood`、`-pomodoro`、`-report`、`-scan`、`-tasks`、`-theme`、
`-timetable`、`-toolbox`、`-wordbook`。`packageName` 映射在 `packages/plugins/src/rules.ts` 的
`PACKAGE_BY_ID`，新增插件必须登记。

注意：这 13 个构建期包的清单在 `src/index.ts` 的 `manifest`（`@gofor/plugin-api`），
**不在 `package.json` 的 `gofor` 字段**；`gofor` 字段只属于运行时插件（见 §9）。

默认禁用：`gofor.theme.sepia`（启用即改整站外观，必须是用户主动选择）。

### 数据契约

| 契约 | 提供方 | 版本 | 说明 |
|---|---|---|---|
| `sessions.range` | core | 1 | 区间学习记录 |
| `subjects.all` | core | 1 | 全部科目 |
| `habits.range` | core | 1 | 打卡项 + 区间记录 |
| `mood.range` | core | 1 | 三滑块 |
| `diary.range` | core | 1 | 情绪日记 |
| `toolbox.recent` | core | 1 | 练习记录 |
| `tasks.all` | core | 1 | 作业 |
| `checklists.all` | core | 1 | 环境清单定义 |
| `wordbook.entries` | `gofor.wordbook` | 1 | 单词库词条（可按词/标签过滤） |

### 不变量

1. 打印/扫描几何、模板、坐标清单、二维码/条码在 core；插件只声明区块归属，不能算坐标。
2. 插件页面懒加载；`chrome:'none'` / `layout:'full'` 不得把打印层卷进 `.screen-only`。
3. 主题只覆盖屏幕层 token；纸面固定白底黑字。

（打印区块与扫描回填的不变量见 §6。）

## 9 运行时插件（P3.7）

构建期插件解决"功能页"，运行时插件解决"装一个包就多几条命令/插槽/打印模板"。两套 API 不互通：

- 契约：`@gofor/contracts` 的 `GoForPluginAPI`（`registerCommand` / `registerViewSlot` /
  `registerPrintTemplate` / `getTasks` / `updateTask`）。
- 加载：主进程 `@gofor/plugin-runtime`，从 `app.getPath('userData')/plugins` 读 `enabled`，
  `createRequire` 加载入口，5s 超时、单插件失败隔离、`reloadPlugins()`。
- 安装：`gofor plugin add/remove/list`（`@gofor/plugin-cli`）；清单 `gofor.plugins.json`。
- UI：主进程只经 IPC 给 `{ slotId, pluginId, renderer, componentName }`；渲染进程按
  `gofor-plugin://<包名>/<renderer>` 懒加载组件，不 eval。
- 示例：`examples/gofor-plugin-hello`（独立目录，不在 workspace）。

完整步骤、IPC 时序、任务桥与排障见 [`PLUGIN-RUNTIME.md`](PLUGIN-RUNTIME.md)。

## 10 尚未支持

- 插件之间调用方法（public/private service facade）——目前只有只读数据契约。
- 打印模板插件、自定义 block 类型（构建期平面）。
- 运行时插件的页面/主题/数据契约、签名、registry、版本范围、依赖解析。
- 网络、文件系统、通知、常驻 overlay。

## 11 提交前自检

- `pnpm typecheck` / `pnpm test` 绿。
- 页面在 360px 下不横向溢出，深色主题可读。
- 用完的订阅/定时器在 `deactivate` 清理。
- 新增存储必须进备份切片。
- 涉及打印/扫描的改动必须跑 `pnpm verify`（e2e 会生成 PDF 并扫回来）。
