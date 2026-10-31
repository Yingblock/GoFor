# 0011 — 插件宿主阶段一：绑定 0.0.0.0，仅服务 loopback

日期：2026-10-31
状态：**阶段一已实现**
相关：`0008`（运行时插件）、`0010`（构建期自动发现）、`docs/PLUGIN-HOST.md`

## 背景

用户要求外部插件拥有页面/主题/数据权限，并且 4173 也要加载外部插件；
手机通过局域网访问 4173 时也要可用。最终确认：

- 数据集中到插件宿主；
- 现阶段只绑定 `0.0.0.0`，不实际处理外部请求；
- 鉴权/适配后期再做。

## 决定

1. 新增 `@gofor/plugin-host`（Node，非 Electron）：
   - 默认 `0.0.0.0:47822`；
   - 默认只接受 loopback（127.0.0.1 / ::1 / IPv4-mapped）；
   - LAN 请求返回 403；`--allow-lan` 仅预留给后续，当前无鉴权。
2. 复用 `@gofor/plugin-runtime` 的 `PluginManager`，提供：
   `/health`、`/api/plugins/snapshot`、`/api/plugins/reload`、
   `/api/plugins/run-command`、`/plugins/<pkg>/<path>`。
3. 数据层不接入：`TaskStore.getTasks/updateTask` 明确报未接入，避免假装有数据。
4. 不做 PWA external client、CORS、令牌、SQLite、多设备数据会话。

## 影响

- 4173 当前仍只跑内置 13 插件；外部插件 UI 还没接。
- `pnpm plugin:host` 可启动服务；`0.0.0.0` 监听已就位，LAN 被 403。
- 单测 +2（loopback/snapshot）。
- 后续 v2 契约（外部 renderer 页面/主题/数据/扫描）与数据集中另立阶段。

## 未做

- 把外部插件 main/renderer 接入 PWA 注册表；
- CORS/令牌/LAN 鉴权；
- 宿主 SQLite/JSON 数据层与设备会话；
- 把 13 个内置插件迁到外部插件平面。
