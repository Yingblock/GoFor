# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P0 地基 —— 刚初始化，骨架已搭好，尚未有业务功能。**

- Node 22.23 / pnpm 12.4 / Debian 13
- Rust 与 Java 未安装（P5 之后才需要，不影响现在）

## 下一步做什么（按顺序，做完一条划掉一条）

1. `pnpm dev` 跑起来，确认 Windows/手机上能访问
2. 接 Dexie：`packages/core/src/db/` 建 schema v1 + 迁移器 + 仓储层
3. PWA：manifest + service worker + 图标，确认可以"添加到主屏"
4. 命令面板骨架（Ctrl+K）

## 什么坏了 / 什么没做完

- 无。所有 TODO 都还没开始。

## 怎么跑起来

```bash
pnpm install
pnpm test        # 单元测试
pnpm dev         # 开发服务器（默认 5173）
pnpm build       # 产物到 apps/web/dist
pnpm check       # Biome 检查 + 格式化
```

## 最近一次更新

初始化 P0 骨架。
