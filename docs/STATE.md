# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P0 完成。产品已经能用：能记作业、涂专注格、把「我的一天」打成一张 A4。**

GitHub 仓库：<https://github.com/Yingblock/GoFor>（private）。
里程碑 P0–P8 已建；P1 已拆成 issues #8–#23，挂在 `P1 离线核心` 下。P2–P8 的
任务拆解仍以 `docs/ROADMAP.md` 为准，进入阶段后再拆 issue。

验证（`pnpm verify` 全绿 = typecheck + 单测 + build + 9 项浏览器 e2e）：

- ✅ monorepo：`apps/web`、`packages/core`、`packages/store`
- ✅ TypeScript 7.0.2 strict
- ✅ **`Clock` 抽象**（系统/手动时钟）—— 领域层禁止直接 `Date.now()`
- ✅ **配置层**：zod schema、默认值、深合并、课时从作息表推导（中位数）、专注格换算
- ✅ **纸面时间解析**：`19:30` / `1930` / `19点30分` / 跨零点；歧义靠分栏消除
- ✅ **打印版式引擎**：mm 单位、12 列网格、固定高度、自动分页、归一化坐标
- ✅ **Dexie 数据层**：config / tasks / subjects / sessions / templates，含配置迁移与导入导出
- ✅ **PWA**：manifest + service worker + 图标，可安装、离线可用
- ✅ **命令面板**（⌘K）：打印 / 切纸张 / 导出 / 导入
- ✅ **首张可打印的纸**：`pnpm build && pnpm e2e` 会生成 `e2e/out/day-sheet.pdf`

## 打包产物（一次性，见 DECISIONS/0002）

| 产物 | 状态 | 说明 |
|---|---|---|
| `release/GoFor-win-x64.zip` | ✅ 已验证启动 | Electron v33 壳，双击 `GoFor.exe`；DevTools 确认页面标题 GoFor、URL 指向内置 127.0.0.1 服务 |
| `release/GoFor-debug.apk` | ✅ 已构建验证 | 4.2MB，`app.gofor.study` v1.0，minSdk 24 / targetSdk 36；纯 WebView 壳 |
| `release/README.md` | ✅ | 安装说明与已知限制 |

两者都只是"看一眼"，不是发布形态。正式渠道仍是 PWA。

## 下一步做什么（P1 起点，做完一条划掉一条）

1. **番茄钟状态机**（P1-1.1，20h）：时间戳差值、暂停/恢复、中断恢复、分心冲动记录
2. **作业清单补全**（P1-1.5）：截止时间、必做/选做、子任务、拖拽排序
3. **课表数据模型**（P1-1.6/1.7）：Course / Rule / Override / WeekPattern + 周视图
4. **模板编辑器 v0**（P1-1.11，14h）：组件面板拖入、排序、span/行数、实时溢出提示

## 踩过并修掉的坑（别再犯）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| 在 `liveQuery` 里写库 | `ReadOnlyError`，整棵组件树白屏 | 配置读取拆成 `readConfig`（只读）/ `currentConfigOrDefault`（启动时修复一次） |
| 打印层嵌在 `.screen-only` 里 | 打出来是白纸（PDF 只有 938 字节） | `PrintLayer` 必须渲染在 `.screen-only` **之外**；e2e 用 PDF 体积 + 渲染兜住 |
| `@gofor/core` 根导出带 zod | 只用到时钟的宿主也打进 46KB zod | 子路径导出：`@gofor/core/config`、`/print`、`/paper`、`/domain` |
| Biome 扫到 Capacitor 生成的 Java/XML | 4000+ 假错误，`pnpm check` 直接失败 | `biome.json` 的 `files.includes` 排除 `apps/web/android` |

## 什么坏了 / 什么没做完

- 无已知崩溃。`apps/web` 还没接路由与 shadcn/ui 组件库（当前是手写 Tailwind）。
- 首屏 bundle 433KB（gzip 137KB），后面可按路由拆包；现在不值得优化。
- A4 纸面底部约 1/4 留白（留给手写），不是 bug。

## 怎么跑起来

```bash
pnpm install
pnpm dev         # http://localhost:5173 ，同局域网手机可访问
pnpm test        # 单测（core + store）
pnpm e2e         # 真实浏览器冒烟 + 生成 e2e/out/day-sheet.pdf（需先 pnpm build）
pnpm typecheck
pnpm build
pnpm check       # Biome 自动修复
pnpm verify      # typecheck + test + build + e2e
```

## 关键默认值（要改先看这里）

- 纸张：**A4**。完整混合版实测约 201mm 高，A5 的 194mm 装不下；A5 留给精简版与口袋卡。
- 专注格单位：`'period'`（跟随作息表推导），作息表为空时回退 45 分钟。
- 墨迹阈值：0.12；`scan.autoApply = false`（识别结果进待确认列表）。

## 最近一次更新

建立 GitHub 仓库（private）、P0–P8 milestones 与 labels；P0 的 7 个 issue 已关闭，
P1 拆成 16 个 open issue（#8–#23）。补了 README，并把 Android Capacitor 壳与
Windows 便携打包试验入库（都只是验证壳，不是正式分发方案）。
