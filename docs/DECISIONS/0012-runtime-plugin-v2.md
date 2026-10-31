# 0012 — 运行时插件 v2：页面/主题/数据/扫描 + PWA 客户端

日期：2026-10-31
状态：**已实现（loopback 垂直切片）**
相关：`0008`（运行时插件）、`0011`（插件宿主阶段一）、`docs/PLUGIN-HOST.md`、`docs/PLUGIN-RUNTIME.md`

## 背景

阶段一只有五方法（命令/插槽/打印模板/tasks），外部插件不能注册页面、主题、
数据契约、扫描 handler；PWA 也没有外部插件客户端。用户要求这些能力，并确认
外部插件要能在 4173 出现、扫描由 core 分析后交给插件处理。

## 决定

1. **契约 v2（additive，`apiVersion` 仍为 `"1"`）**：
   - `PluginManifest.capabilities` 扩为 `command | view-slot | print-template |
     screen | theme | data | scan`；
   - `GoForPluginAPI` 增加 `registerScreen` / `registerTheme` / `registerData` /
     `registerScanHandler`，参数全部是可序列化声明；
   - 组件、data query、scan handler 在 `gofor.renderer` 里按名字导出；
   - manifest 增加可选 `permissions` 与 `renderer`。
2. **PluginManager** 收集这些声明并放进 `snapshot`：
   `screens` / `themes` / `data` / `scanHandlers`；状态带 `renderer`/`permissions`。
3. **plugin-host** 提供 CORS（仅 loopback origin）与 renderer 资源；快照直接返回上面的数组。
4. **PWA external client**（`apps/web/src/plugins/external.ts`）：
   - 默认关闭；`localStorage.gofor.externalPlugins=1` 或 `?external=1` 才请求 47822；
   - 拉 snapshot，按 `pkg + renderer + ?v=<snapshot.version>` import；
   - 合并页面/主题/插槽/命令/数据契约/扫描 handler 到现有宿主快照；
   - React 由 `window.__GOFOR_HOST__.React` 提供，避免每个外部插件重复打包。
5. **扫描边界不变**：core/vision 分析图片 → `ScanResult[]` → 按 owner 分组 →
   外部插件 renderer 的 `scanHandlers[owner]` 处理；主进程不碰图片。
6. **示例** `examples/gofor-plugin-hello` 升级：页面、主题、插槽、数据契约、
   扫描 handler，验证用按钮触发 `applyScan`。

## 影响

- 外部插件现在可以：加页面/侧栏条目、加主题 token、加插槽、加命令、提供数据契约、
  接收自己的扫描结果；PWA（本机 loopback）可加载。
- 数据仍在各设备 IndexedDB（插件页 `host.data` / `host.storage`）；**宿主数据集中未做**，
  `plugin-host` 的 `getTasks/updateTask` 仍报未接入。
- 4173 外部插件必须显式启用（插件目录按钮 / `?external=1`），且先启动 plugin-host。
- LAN 仍 403；`--allow-lan` 与鉴权/适配未做。
- 单测 577（runtime +1）。

## 未做

- 宿主 SQLite/JSON 数据集中与多设备会话；
- LAN CORS/令牌/TLS；
- 外部 print template 在打印层的集成；
- 把 13 个构建期插件迁到外部平面。
