# 插件开发指南

> 面向"想给 GoFor 加东西"的开发者。边界见 `DECISIONS/0004`、`0006`、`0007`；
> 现有插件的规则清单见 [`PLUGIN-RULES.md`](PLUGIN-RULES.md)。

## 0. 插件 = npm 包，随应用构建

| | 现在的规则 |
|---|---|
| 位置 | `packages/plugins/src/<plugin>/`（统一在 `@gofor/plugins` 包里） |
| 形态 | TypeScript 模块，`export const xxxPlugin: PluginModule = { manifest, activate }` |
| 安装 | 随应用构建；没有运行时安装、没有 Blob/`import()`、没有 `window.GoForSDK` |
| 更新 | 改代码 → `pnpm build` / 发版；开发期 `pnpm dev` 有 HMR |
| 启用/禁用 | 只切换注册表与 Dexie 里的 enabled；**不删插件数据** |
| 信任 | 构建期代码，可 import `@gofor/core` / `@gofor/store` / `@gofor/ui` / `@gofor/plugin-kit` |

没有"用户粘贴单文件 JS"这条路：它无法 typecheck、无法带依赖、也没有真正的沙箱；
需要新功能时直接加一个包内插件模块并登记到 `BUILTIN_PLUGINS`。

## 1. 最小插件

```ts
import { PLUGIN_API_VERSION, type PluginModule } from '@gofor/plugin-api';

export const helloPlugin: PluginModule = {
  manifest: {
    id: 'me.hello',              // 小写点分，全局唯一，也是命名空间
    name: 'Hello',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: '示例',
    permissions: ['ui.screen', 'command'],
  },
  activate(ctx) {
    ctx.registerScreen({
      id: 'me.hello/screen',     // 必须 <pluginId>/<screenId>
      title: 'Hello',
      group: '离线·M1',
      icon: '👋',
      order: 100,
      layout: 'content',         // content | full
      chrome: 'default',         // default | none
      load: async () => {
        const module = await import('./Hello.tsx');
        return { default: module.HelloScreen };
      },
    });
    ctx.registerCommand({
      id: 'me.hello/ping',
      title: 'Hello：打个招呼',
      run() {},
    });
  },
};
```

然后在 `packages/plugins/src/index.ts` 的 `BUILTIN_PLUGINS` 里登记。
新增插件**不需要改 `apps/web`**；页面、命令、路由、打印归属都由注册表汇总。

## 2. manifest

| 字段 | 说明 |
|---|---|
| `id` | 小写点分，全局唯一，也是命名空间 |
| `name` / `version` / `description` / `author` | 插件目录展示 |
| `apiVersion` | 必须等于宿主 `PLUGIN_API_VERSION`（当前 1） |
| `permissions` | 见下；注册项会检查 |
| `dependencies` | 硬依赖：`{ "other.id": "^1.0.0" }`；缺失/禁用/版本不符 → 不激活 |
| `optionalDependencies` | 可选依赖：只影响顺序，缺失不报错 |
| `provides` | 声明 screens / commands / data / themes / content / converters / **printBlocks** |

权限：`ui.screen` / `ui.slot` / `ui.theme` / `ui.css` / `command` / `data.read` /
`data.provide` / `storage` / `converter` / `connector` / `scan.handle` / `ocr` / `ai` / `network`。
`network` 目前宿主不提供任何网络能力。

## 3. 能注册什么

- **页面** `registerScreen`：`<pluginId>/<screenId>`，`#/s/<id>`，`layout` / `chrome` / `shell` / `order`
- **命令** `registerCommand`：命令面板 + 快捷键（`Mod+K` 等），冲突由宿主检测
- **插槽** `registerSlot`：`home.after-stats` / `app.header.right` / `app.sidebar.footer` / `screen.<id>.after`
- **主题** `registerTheme`：只覆盖屏幕层 token
- **作用域 CSS** `registerCss`：宿主包 `@media screen { @scope ([data-plugin-surface="id"]) }`
- **内容模块** `registerContentModule`：`notebook` / `wordbook` / `file-view` + `search()`
- **转换器** `registerConverter`：只能指定宿主 Worker 白名单任务或 `needsDesktopBridge`
- **连接器** `registerConnector`：默认关闭
- **数据契约** `registerData`：只读，见下
- **扫描处理器** `registerScanHandler`：纸面区块 owner 负责把自己的识别结果写回
- **打印区块归属** `provides.printBlocks`：插件禁用后该区块在预览/打印里静默跳过，
  预览下方给「缺失 XX 插件」警告；**只有构建期插件能声明**
- **OCR/AI provider**：接口已定，宿主默认「未配置」

`PluginContext` 还有：`data` / `storage` / `now` / `newId` / `log`。
页面/插槽/命令的 host 另有 `navigate` / `back` / `applyScan`。

## 4. 数据契约（跨插件取数）

```ts
ctx.registerData({
  id: 'wordbook.entries',
  version: 1,
  summary: '单词库全部词条',
  query: async (input) => entries,
  revision: async () => fingerprint,
});
```

解析顺序：**core > 已启用插件 > 未安装**；缺失返回 `null`，界面显示「未安装」，不能当 0。
禁止插件互读 `pluginData`（对方禁用后会静默读到空）。
core provider：`sessions.range` / `subjects.all` / `habits.range` / `mood.range` /
`diary.range` / `toolbox.recent` / `tasks.all` / `checklists.all`。

## 5. 打印区块与扫描回填

- 区块归属写在 `manifest.provides.printBlocks`（例如 `['checkboxList']`）；
- 打印/模板预览前 `resolvePrintBlocks` 会跳过缺失插件的区块；模板页的「加区块」
  也只列出当前可用（已启用插件 + core）的 kind；
- 坐标清单 target 带 `owner`，`ScanResult` 带 owner；宿主按 owner 调插件 handler；
- 缺插件/处理器抛错：确认页显示「缺失 XX 插件，N 项未回填」，**不写库、不标 applied**；
- 旧清单没有 owner 时按 payload 前缀回退（`task→gofor.tasks` 等）。

## 6. 存储与备份

- 插件数据走 `host.storage`（`get/put/list/delete/clear`），落到 Dexie v8 的
  `pluginData`：主键 `<pluginId>/<collection>/<key>`，值 JSON 字符串；
- 集合名/键限制安全字符；插件**不能**自己开 Dexie 表；
- **禁用/卸载都不清数据**（现在没有卸载 UI；`deletePluginRecord(..., {deleteData:true})` 才清）；
- 导出备份包含 `pluginData`（格式 v2），导入合并；
- 插件记录在 `plugins` 表（现在只有内置）；`source` 是旧运行时字段，不再读取。

## 7. 现有插件与规则

见 [`PLUGIN-RULES.md`](PLUGIN-RULES.md)。机器可读版本在
`packages/plugins/src/rules.ts` 的 `PLUGIN_RULES`。

## 8. 尚未支持

- 插件之间调用方法（public/private service facade）——目前只有只读数据契约；
- 第三方独立发布 npm 包并动态装载（当前是 workspace 包 + 随应用构建）；
- 打印模板插件、自定义 block 类型；
- 网络、文件系统、通知、常驻 overlay。

## 9. 提交前自检

- `pnpm typecheck` / `pnpm test` 绿；
- 页面在 360px 下不横向溢出，深色主题可读；
- 用完的订阅/定时器在 `deactivate` 清理；
- 新增存储必须进备份切片；
- 涉及打印/扫描的改动必须跑 `pnpm verify`（e2e 会生成 PDF 并扫回来）。
