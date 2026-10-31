# 插件宿主（阶段一 + v2 垂直切片）

> 决策：`DECISIONS/0011`（绑定/loopback）、`DECISIONS/0012`（外部插件 v2）。
> 这是给 4173/PWA 用的 Node 服务，不是 Electron 主进程；Electron 继续用
> `apps/desktop` 的 `PluginManager`。

## 现在能做什么

- 绑定 `0.0.0.0:47822`（默认端口）；
- **只响应 loopback（127.0.0.1 / ::1）**；LAN 请求一律 403；
- 读 `userData/plugins`，跑 `PluginManager`，提供插件快照；
- 提供 renderer 资源路由 `/plugins/<包名>/<相对路径>`；
- 对 loopback origin 提供 CORS（4173/5173/47821）；
- v2：快照包含外部插件的 screens/themes/data/scanHandlers；PWA 可拉取并加载；
- 数据层**未集中**：`getTasks/updateTask` 明确报未接入；外部插件页面用本地
  `host.data` / `host.storage`；
- 没有 LAN CORS / 鉴权 / TLS；`--allow-lan` 只是预留。

## 启动

```bash
pnpm --filter @gofor/plugin-runtime build
pnpm --filter @gofor/plugin-host build
node packages/plugin-host/dist/cli.js
# 或
pnpm plugin:host
```

参数：

```text
--host 0.0.0.0        # 默认
--port 47822          # 默认
--user-data <dir>     # 默认按平台推 Electron userData
--allow-lan           # 预留：打开后允许 LAN（当前无鉴权，不要用）
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | `{ ok, bind, allowLan, pluginsDir, note }` |
| GET | `/api/plugins/snapshot` | `PluginSnapshot`（状态/插槽/命令/打印模板） |
| POST | `/api/plugins/reload` | 卸载重载，返回 snapshot |
| POST | `/api/plugins/run-command` | body `{ id }` |
| GET | `/plugins/<pkg>/<path>` | 插件包内文件（MIME + 路径穿越校验） |

## 外部插件在 4173 怎么用

1. 启动宿主：

```bash
pnpm --filter @gofor/plugin-runtime build
pnpm --filter @gofor/plugin-host build
pnpm plugin:host
```

2. 在 4173 的「插件与扩展」页点「启用外部插件」（或打开
   `http://127.0.0.1:4173/?external=1`）；
3. 刷新。外部插件的页面/主题/插槽/数据/扫描 handler 会合并进宿主注册表。

默认关闭是为了避免没有启动 plugin-host 时每个页面都产生一条
`ERR_CONNECTION_REFUSED`。外部插件 renderer 通过
`/plugins/<包名>/<renderer>?v=<快照版本>` 加载，版本变化会换 URL，避免模块缓存。

## 为什么先绑 0.0.0.0 却不处理 LAN

用户 2026-10-31 确认：数据最终集中到插件宿主，但现阶段只做绑定，
不实际处理外部请求；鉴权/适配后期再做。于是：

- 端口监听在 `0.0.0.0`，手机能建 TCP；
- 服务按 `socket.remoteAddress` 拒绝非 loopback，返回 403；
- 这样后续加 CORS/令牌时不改监听方式。

## 还没做

- 宿主数据集中（SQLite/JSON）与 `getTasks/updateTask`；当前外部插件数据仍在各设备 IndexedDB；
- LAN CORS、令牌、TLS、多设备数据会话（手机外部插件仍是 403）；
- 外部 print template 在打印层的集成；
- 4173 systemd 增加 `gofor-plugin-host.service`。

## 验收

```bash
curl http://127.0.0.1:47822/health          # 200
curl http://<LAN-IP>:47822/health           # 403（阶段一）
```

单测：`packages/plugin-host/tests/server.test.ts`。
