# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P1 + P2 完成。离线闭环已经能「打印 → 手写 → 拍照扫回来」：作业/课表/打卡/番茄，纸上有二维码，扫描后逐条确认再写库。**

GitHub 仓库：<https://github.com/Yingblock/GoFor>（private）。
里程碑 P0–P8 已建；P1 已拆成 issues #8–#23，挂在 `P1 离线核心` 下。P2–P8 的
任务拆解仍以 `docs/ROADMAP.md` 为准，进入阶段后再拆 issue。

验证（`pnpm verify` 全绿 = typecheck + 单测 + build + 71 项浏览器 e2e）：

- ✅ monorepo：`apps/web`、`packages/core`、`packages/store`
- ✅ TypeScript 7.0.2 strict
- ✅ **`Clock` 抽象**（系统/手动时钟）—— 领域层禁止直接 `Date.now()`
- ✅ **配置层**：zod schema、默认值、深合并、课时从作息表推导（中位数）、专注格换算
- ✅ **纸面时间解析**：`19:30` / `1930` / `19点30分` / 跨零点；歧义靠分栏消除
- ✅ **打印版式引擎**：mm 单位、12 列网格、固定高度、自动分页、归一化坐标
- ✅ **Dexie 数据层**：config / subjects / tags / tasks / sessions / timetable / templates / habits / habitLogs；v1→v4 三次迁移各有测试
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
包内 JS 已核对含「拍照录入」「离线·M2」、不含「专注格」。

## P1 进度：已完成

15 项全部落地，`pnpm verify`（typecheck + test + build + e2e）全绿。

| 任务 | 状态 | 产出 |
|---|---|---|
| 1.0 应用外壳与导航 | ✅ | 左侧按 离线·M1/离线·M2… 分组，手风琴展开 |
| 1.1 番茄钟状态机 | ✅ | 双时钟；16 测试 |
| 1.2 启动体验 | ✅ | 时长快捷项、科目/任务选择 |
| 1.3 分心记录 | ✅ | 单键 +1，随 run 持久化 |
| 1.4 会话归类 | ✅ | 番茄绑定科目/任务，首页展示今日记录 |
| 1.5 作业清单增强 | ✅ | 截止、必做/选做、子任务、上移下移 |
| 1.6 课表模型 | ✅ | 36 测试；Occurrence 算出来不落库 |
| 1.7 课表视图 | ✅ | 学期/作息表/课程/规则录入 + 周视图（连堂跨行） |
| 1.8 每日打卡 | ✅ | 14 天网格 + 周几重复/起止日期；**只读 habitLogs，与番茄钟无关** |
| 1.9 打印引擎 | ✅ | 版式引擎 + 预览 + 分页 |
| 1.10 模板 ×5 | ✅ | day / week / checkin / index-card / countdown；19 测试 |
| 1.11 模板编辑器 v0 | ✅ | 选模板 / 增删区块 / 行数 / 换纸 / 预览 / 保存 |
| 1.12 打印校准页 | ✅ | 近似刻度（精确毫米尺需新增 `ruler` block） |
| 1.13 统计 | ✅ | 36 测试 + 接入首页（今日专注、连续学习） |
| 1.14 导入导出 | ✅ | JSON + 格式版本 |

测试：core 285 + store 41 + vision 38 = **364 单测**；e2e **71 项**。

### 第三批反馈修复（2026-xx）

| 反馈 | 处理 |
|---|---|
| 选完标签建完任务会自动清空标签 | 提交后不清空（面板展开状态也不动）；标签会带到下一条，随时可点掉。e2e 断言「新任务真的继承了标签」，只测界面计数会漏掉"界面留着、数据没写" |
| 要能改「当前时间」调试（后期删） | 宿主层 `appClock` + 侧栏「调试 · 当前时间」面板：只偏 `now()`，`monotonic`/定时器原样转发（偏了会算坏运行中的番茄钟）；偏移存 localStorage，应用后 reload；`TODO(debug-clock)` 可 grep，三步删除法在 `docs/LATER.md` |
| 首页要打卡提示 | 首页「打卡提示」：今天该打未打的项，可就地勾完并显示 `已完成 x/y`；**只读 `habitLogs`**，不看番茄钟 |
| 首页要看当天课表 | 首页「今日课表」：起止时间 + 科目，复用 App 里给打印层算好的同一份 schedule；今天没课明确写「今天没有课」 |

### 第二批反馈修复（2026-xx）

| 反馈 | 处理 |
|---|---|
| 课表要能点格子直接填课 | 周视图加「编辑模式」：点空格子选科目即生成规则，点课程块可删 |
| 连堂不自动合并 | `core/timetable/mergeAdjacent`（节次相接才合并，中间空一节算课间） |
| 打卡要能建多个项 + 重复规则 | 新增 `habits`/`habitLogs`（Dexie v4），支持周几重复与起止日期 |
| 打卡能打过去/未来 | **未来不渲染、过去只读**；打卡只写今天 |
| 打卡与番茄钟耦合 | 彻底解耦：`Checkin.tsx` 不读 `sessions`、不 import pomodoro；首页指标改名「连续学习」 |
| 添加作业时就能选标签 | 添加栏内置标签面板，提交时带上 tags 与 subjectId |
| 模板区块内容不能改 | 各 kind 暴露自己的字段（文字/标签/行数/时段/分隔数组） |
| 添加「当前时间」区块 | 新增 `timestamp` 区块，打印那一刻取本地时间 |
| 纸面没读到真实课表 | 根因是 `asTimetable` 对缺字段过于严格（旧数据没有 `courses`/`weekPatterns`）→ 整份判废；改为缺则补空 |

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

### P2 交付：纸的回流 + 行为层（2026-xx）

| 块 | 落地位置 | 说明 |
|---|---|---|
| 二维码 + 深链 | `core/scan/deeplink.ts`、`qr.ts` | `gofor://fill?v=1&t=day&d=YYYY-MM-DD&p=A4`；纸面右上 16mm |
| 扫描端 | `screens/Scan.tsx` + `screens/scan/*` | 选照片/摄像头帧 → 手动四角（主路径）→ 单应矫正 → Otsu 二值化 → 解二维码 |
| 坐标注册表 | `core/scan/manifest.ts` + `sheetManifests` 表 | **打印页进入时就固化**，键是「模板@日期@纸张」 |
| 笔迹检测 | `packages/vision` | `toGray`/`otsuThreshold`/`binarize`/`warpQuad`/`inkRatio`；38 测试 |
| 回填确认 | `screens/scan/ScanReview.tsx` + `applyScanResults` | 默认全选、逐条可取消；只写这张纸的日期；应用/丢弃都留记录 |
| 环境清单 | `screens/Checklist.tsx` | 可编辑清单 + 今日勾选 + 近似历史完成率 |
| 三滑块 + 纸上回流 | `screens/Mood.tsx` + `ratingGrid` 区块 | 纸上印成 1–5 勾选格（手写数字读不回来）；扫回来的数值写 `moodLogs` |
| 自助工具箱 | `core/wellbeing` + `screens/Toolbox.tsx` | 4-7-8 / 渐进放松 / 5-4-3-2-1 / 身体扫描；进度由"已过毫秒"算，暂停不漂 |
| 情绪日记 | `screens/Diary.tsx` | 本地、标签、心情 1–5；趋势图未做（LATER） |
| 自我周报 | `screens/Report.tsx` | 本周学习分钟、科目 Top、打卡率、三滑块均值、练习次数；复习完成度标「P4 接入」 |

**布局（同期修复）**：桌面侧栏可折叠成图标列（`localStorage` + `Ctrl/⌘+B`），窄屏保持抽屉；
打印预览按容器缩放（**只缩屏幕预览，打印尺寸不动**）；360px 下九屏无横向溢出（e2e 逐页量）。

### P1 收尾：把「能跑」补成「敢长期用」（2026-xx）

功能做完之后回头审，修的全是**承重件**，没有加新功能。设计依据见 `docs/DESIGN.md` §15。

| 缺口 | 处理 | 证据 |
|---|---|---|
| 数据只在 IndexedDB，浏览器存储紧张时会静默清掉 | 启动申请 `navigator.storage.persist()`；距上次备份 ≥ `backup.reminderDays`（默认 7 天）时顶部提醒，一键导出 JSON | `apps/web/src/backup.ts`、`BackupBanner.tsx`；e2e 覆盖「下载 → 结构 → lastAt → 横幅消失 → 再导入 → 坏文件」 |
| `exportAll` 漏了 5 张表（打卡 / 打卡日志 / 课表 / 标签池 / 番茄运行） | 导出导入改成全量表；旧备份文件缺字段时按空数组兼容 | `store.test.ts` 往返用例真的建了 5 张表；e2e 断言备份文件含全部表 |
| 渲染异常直接白屏（历史上因 `liveQuery` 写库发生过） | 根 `ErrorBoundary` + 按页 `ScreenBoundary`（切页自动解除错误） | 临时注入异常 → fallback 文案出现 → 重试恢复 → 回滚后 dist 无残留 |
| 没有 CI，「提交必须绿」只靠自觉 | `.github/workflows/verify.yml`：push / PR / 手动都跑 `pnpm verify` | 6 步（pnpm → node → install → Playwright Chromium → verify） |
| `Timetable.tsx` 1102 行，最复杂的逻辑没有测试 | 纯计算搬进 `core/timetable`（`draft` / `grid` / `edit`），JSX 拆成 Term / Courses / Week 三个 section | 214 行；新增 31 条 core 测试（连堂合并、占格、作息表增删改、解析兜底） |
| `listHabitLogs` / `listActiveFocusRuns` 整表读进内存再 filter | 改走 `date` / `status` 索引 | store 测试 +3（闭区间、多项、空库） |
| STATE 里打卡还写着「有番茄记录自动算」 | 改成与实现一致的说法（只读 `habitLogs`） | 本轮顺带修的两行文档漂移 |

### P1 期间的已知简化（写进 LATER，不是缺陷）

- 课表调课只做「停课一次」，`move` / `replace` 未接 UI
- 校准页是近似刻度，无 1mm 尺、无四角裁切标记
- 模板编辑器不支持自由定位，只做列表式编辑
- 作业排序是上下移，不是拖拽
- **调试时钟（临时）**：宿主层 `appClock` 可前后拨「现在」（localStorage 持久化），上线前删除；
  见 `docs/LATER.md` →「待删除：调试时钟」，代码里有 `TODO(debug-clock)` 标记
- **纸条回流的手写区仍读不了**：时间登记、`slots` 手写格需要 OCR；三格自评改用 `ratingGrid` 勾选格
- **自动找纸不可靠**：`detectPageQuad` 遇到桌面/阴影会选错连通域，手动四角才是主路径
- **无光照均衡、无实时取景框**：靠"重拍一张"和选照片绕过去
- **情绪日记没有趋势图**：只有列表（见 LATER）

## 下一步做什么

P1 的 15 项已全部落地，收尾质量问题也修完了（见上）。下一阶段按 `docs/ROADMAP.md` 走 P2「纸的回流」：

1. **拍照录入**（离线·M2 的入口已经在，功能未实现）：CV 管线（透视矫正、光照均衡、局部采样）+ 二维码/笔迹回填
2. **OCR 校对**：解析结果必须在界面上可改，不追求一次识别正确
3. 之后再进 P3/P4；`docs/LATER.md` 里那些"想做的"不要提前做

## 踩过并修掉的坑（别再犯）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| 在 `liveQuery` 里写库 | `ReadOnlyError`，整棵组件树白屏 | 配置读取拆成 `readConfig`（只读）/ `currentConfigOrDefault`（启动时修复一次） |
| 打印层嵌在 `.screen-only` 里 | 打出来是白纸（PDF 只有 938 字节） | `PrintLayer` 必须渲染在 `.screen-only` **之外**；e2e 用 PDF 体积 + 渲染兜住 |
| `@gofor/core` 根导出带 zod | 只用到时钟的宿主也打进 46KB zod | 子路径导出：`@gofor/core/config`、`/print`、`/paper`、`/domain` |
| 往已发布的 Dexie 版本里加表 | 老库不会补建，运行时「表不存在」 | 必须新开 `version(N+1)`；已补 v2→v3 迁移测试 |
| 主 session 里跑 build/e2e/下载 | 用户白等 10–40 分钟，上下文被日志淹没 | **长任务一律子代理或后台作业**，见 AGENTS.md §0 |
| 打印时不固化坐标、扫描时现算 | 中间改过作业顺序，勾选会被记到别人头上（静默错数据） | 进入打印页就存 `sheetManifests` 快照；按「模板@日期@纸张」键覆盖 |
| 二维码印 12mm | 预览截图里只有 29px，jsQR 解不出来；纸上手机也可能扫不出 | 加到 16mm；e2e 用 4 倍像素密度截图当"照片" |
| e2e 只 `server.kill()` 父进程 | 每跑一次漏一个 `vite preview` 占着 4173；下一次 e2e 连上**旧构建**的服务，照样"全绿"（假绿） | `spawn(..., { detached: true })` 后按进程组清；开跑前先查端口，有人应答就直接报错 |
| Biome 扫到 Capacitor 生成的 Java/XML | 4000+ 假错误，`pnpm check` 直接失败 | `biome.json` 的 `files.includes` 排除 `apps/web/android` |

## 什么坏了 / 什么没做完

- 无已知崩溃。`apps/web` 还没接路由与 shadcn/ui 组件库（当前是手写 Tailwind）。
- 首屏 bundle 515KB（gzip 158KB），单包、无路由分包；现在不值得优化（PWA 首次加载后走 Service Worker）。
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
