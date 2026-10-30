
## CI（GitHub Actions）

`.github/workflows/verify.yml` 在 push 到 `main`、
每个 PR、以及手动触发时跑 `pnpm verify`（typecheck + test + build + e2e）。
e2e 是真实浏览器冒烟，会自己起 `127.0.0.1:4173` 的 preview 服务，所以 CI 里
先装了 Playwright 的 Chromium（带系统依赖）——Node 里测不出 IndexedDB、打印 CSS、
全屏遮罩这些东西。

- **红 = 阻塞合并。** 类型、单测、构建、e2e 任何一环挂了都算这次改动有问题，先在本地跑 `pnpm verify` 复现：本地和 CI 跑的是同一条命令，不用猜。
- **不要在没有绿的情况下合并。** PR 的 verify check 全绿再合，不要「先合再修」。
- CI 只做校验：不部署、不发 release、不读 secrets。