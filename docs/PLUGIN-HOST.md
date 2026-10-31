# 插件宿主（阶段一）

> 决策：`DECISIONS/0011`。这是给 4173/PWA 与后续 LAN 外部插件用的 Node 服务，
> 不是 Electron 主进程；Electron 继续用 `apps/desktop` 的 `PluginManager`。

## 现在能做什么

- 绑定 `0.0.0.0:47822`（默认端口）；
- **只响应 loopback（127.0.0.1 / ::1）**；LAN 请求一律 403；
- 读 `userData/plugins`，跑 `PluginManager`，提供只读插件快照；
- 提供 renderer 资源路由 `/plugins/<包名>/<相对路径>`；
- 数据层**未接入**：`getTasks/updateTask` 明确报未接入；
- 没有 CORS / 鉴权 / TLS；这些都留给 LAN 阶段。

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

## 为什么先绑 0.0.0.0 却不处理 LAN

用户 2026-10-31 确认：数据最终集中到插件宿主，但现阶段只做绑定，
不实际处理外部请求；鉴权/适配后期再做。于是：

- 端口监听在 `0.0.0.0`，手机能建 TCP；
- 服务按 `socket.remoteAddress` 拒绝非 loopback，返回 403；
- 这样后续加 CORS/令牌时不改监听方式。

## 还没做

- PWA 侧 external plugin client（拉 snapshot / import renderer / 合并注册表）；
- 外部插件 v2 契约（页面/主题/数据/扫描 handler 的 renderer 导出）；
- 数据集中（SQLite/JSON）与 `getTasks/updateTask`；
- LAN CORS、令牌、TLS、多设备数据会话；
- 4173 systemd 增加 `gofor-plugin-host.service`。

## 验收

```bash
curl http://127.0.0.1:47822/health          # 200
curl http://<LAN-IP>:47822/health           # 403（阶段一）
```

单测：`packages/plugin-host/tests/server.test.ts`。
