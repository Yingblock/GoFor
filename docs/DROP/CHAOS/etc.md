






## 本地服务与壳

- **承载应用的本地服务端口必须固定**（Electron 壳、preview、任何静态服务）。
  IndexedDB / localStorage 按 origin 隔离，端口一变数据就"消失"——Windows 壳曾经用
  `listen(0)`，用户看到的现象就是"关掉窗口全丢"。固定端口 + 单实例锁是底线。
- 用户可见的「导出/导入备份」入口不能只藏在命令面板里：丢数据时没人会去按快捷键。
  现在的入口是「数据与备份」页 + 备份横幅上的「从备份导入」。

## 领域约定

- 时间一律用 `Clock` 抽象，**禁止直接调用 `Date.now()` 或裸 `setTimeout`**。
  原因：番茄钟必须能在测试里被确定性地推进，且后台节流时不能漂移。
- 番茄钟用「时间戳差值」而不是「tick 累加」，避免后台定时器被节流导致计时变慢。
- ID 用 `newId()`，不要自己 `Math.random()`。

## 打包策略

- **不再构建 Windows 包**（用户 2026-10-20 决定）：`tools/package-windows/build.sh` 与
  `release/GoFor-win-x64.zip` 不再是交付物，`release/` 里的旧包只作历史，**不要重建、不要更新校验值**。
- **验收一律在网页上进行**：改完 `pnpm build`（或 `pnpm verify` 里的 build）让 4173 的
  `vite preview` 读到新 `dist`，在 `http://127.0.0.1:4173/` 上点一遍验收；需要自动化时用 e2e。
- Android（Capacitor + gradle）同样不打，等后期适配。
- `release/` 仍不进 git（已 ignore）；**发布 GitHub Release 必须用户明确要求**，默认什么包都不构建。
- **4173 由 systemd 用户服务托管，不要再用 `pnpm preview &` / `nohup` 临时起**：
  `~/.config/systemd/user/gofor-preview.service`（`Restart=always`、已 `enable`，
  用户 `Linger=yes`，所以关终端/WSL 会话结束都不影响）。
  - **必须 `--host 127.0.0.1`**（unit 里已写）：WSL2 的 Windows 端口转发按绑定族镜像，
    绑 `0.0.0.0` 时 Windows 侧只开 `[::1]:4173`，浏览器用 `127.0.0.1` 会连不上；
    绑 IPv4 环回后 Windows 才是 `127.0.0.1:4173`（`localhost` 也可用）。
  - 重建 dist 后**不用重启服务**（`vite preview` 每次请求读磁盘）；
  - 换 node 版本后改 unit 里的绝对路径，再 `systemctl --user daemon-reload && systemctl --user restart gofor-preview`；
  - 看状态/日志：`systemctl --user status gofor-preview` / `journalctl --user -u gofor-preview -f`。
  - 地址固定 `http://127.0.0.1:4173/`；不要用随机端口（IndexedDB 按 origin 隔离）。