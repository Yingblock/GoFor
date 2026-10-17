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
| `release/GoFor-win-x64.zip` | ✅ 已重建校验 | 99.8 MB / 30 文件 / CRC 通过；Electron v33，双击 `GoFor.exe` |
| `release/GoFor-debug.apk` | ✅ 已重建校验 | 4.3 MB，`app.gofor.study` v1.0，minSdk 24 / targetSdk 36；纯 WebView 壳 |
| `release/README.md` | ✅ | 安装说明与已知限制 |

两者都只是"看一眼"，不是发布形态。正式渠道仍是 PWA。
包内 JS 已核对含「拍照录入」「P1·M2」、不含「专注格」。

## P1 进度：已完成

15 项全部落地，`pnpm verify`（typecheck + test + build + e2e）全绿。

| 任务 | 状态 | 产出 |
|---|---|---|
| 1.0 应用外壳与导航 | ✅ | 左侧按 P1·M1/P1·M2… 分组，手风琴展开 |
| 1.1 番茄钟状态机 | ✅ | 双时钟；16 测试 |
| 1.2 启动体验 | ✅ | 时长快捷项、科目/任务选择 |
| 1.3 分心记录 | ✅ | 单键 +1，随 run 持久化 |
| 1.4 会话归类 | ✅ | 番茄绑定科目/任务，首页展示今日记录 |
| 1.5 作业清单增强 | ✅ | 截止、必做/选做、子任务、上移下移 |
| 1.6 课表模型 | ✅ | 31 测试；Occurrence 算出来不落库 |
| 1.7 课表视图 | ✅ | 学期/作息表/课程/规则录入 + 周视图（连堂跨行） |
| 1.8 每日打卡 | ✅ | 14 天网格，有番茄记录自动算 |
| 1.9 打印引擎 | ✅ | 版式引擎 + 预览 + 分页 |
| 1.10 模板 ×5 | ✅ | day / week / checkin / index-card / countdown；19 测试 |
| 1.11 模板编辑器 v0 | ✅ | 选模板 / 增删区块 / 行数 / 换纸 / 预览 / 保存 |
| 1.12 打印校准页 | ✅ | 近似刻度（精确毫米尺需新增 `ruler` block） |
| 1.13 统计 | ✅ | 36 测试 + 接入首页（今日专注、连续打卡） |
| 1.14 导入导出 | ✅ | JSON + 格式版本 |

测试：core 161 + store 19 = **180 单测**；e2e **16 项**。

### 初版使用反馈修复（2026-xx）

| 反馈 | 处理 |
|---|---|
| 番茄钟要能自定义时长 | 快捷项旁加数字输入（1–180 分钟），开始按钮同步显示 |
| 专注要全屏 | 运行态改为 `fixed inset-0` 遮罩，纯 CSS（不用 Fullscreen API） |
| 放弃要二次确认 | 第一次点击变「确认放弃？」，3 秒无操作自动收回 |
| 作业要支持标签 | 新增标签池：科目为虚拟池（不落库），用户可自建池与标签 |
| 子项意义不明且点不动 | 改名「步骤」，整行 label 可点、行内输入新建 |
| 科目要全局共用 | 课表改为读 `subjects` 表，科目增删改一处生效 |
| 模板要能放当日课表 | 新增 `schedule` 区块，内置「我的一天」已含该区块 |
| 要更多纸张尺寸 | 9 种（含 B5 JIS 182×257 与 B5 ISO 176×250 单列） |
| 首页复选框不可选 | 换成真 checkbox，勾掉即从列表消失 |

### P1 期间的已知简化（写进 LATER，不是缺陷）

- 课表调课只做「停课一次」，`move` / `replace` 未接 UI
- 校准页是近似刻度，无 1mm 尺、无四角裁切标记
- 模板编辑器不支持自由定位，只做列表式编辑
- 作业排序是上下移，不是拖拽

## 下一步做什么（P1 收尾后）

**P1 已重新基线并有完整方案：`docs/P1-PLAN.md`**（剩余约 146h ≈ 7.3 周，分三个可验收切片）。
开工前需确认该文档 §7 的四个决策点。



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
| 往已发布的 Dexie 版本里加表 | 老库不会补建，运行时「表不存在」 | 必须新开 `version(N+1)`；已补 v2→v3 迁移测试 |
| 主 session 里跑 build/e2e/下载 | 用户白等 10–40 分钟，上下文被日志淹没 | **长任务一律子代理或后台作业**，见 AGENTS.md §0 |
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
