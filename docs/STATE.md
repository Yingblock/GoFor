# STATE — 当前状态（唯一真相源）

> 每次开工先读这个文件，每次收工更新这个文件。
> 目标是：**半年没碰项目的人，10 分钟内能继续。**

## 现在在哪

**P1 + P2 完成。离线闭环已经能「打印 → 手写 → 拍照扫回来」：作业/课表/打卡/番茄，纸上有二维码 + 页尾条码，扫描后逐条确认再写库。深色主题已加（P2-2.16）。**

GitHub 仓库：<https://github.com/Yingblock/GoFor>（private）。
里程碑 P0–P8 已建；P1 已拆成 issues #8–#23，挂在 `P1 离线核心` 下。P2–P8 的
任务拆解仍以 `docs/ROADMAP.md` 为准，进入阶段后再拆 issue。

验证（`pnpm verify` 全绿 = typecheck + 单测 + build + 105 项浏览器 e2e）：

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
| `release/GoFor-win-x64.zip` | ✅ 本地预览包（2026-10-20，HEAD `5e37d90`，P2-2.17 v1 + 课表备注布局修复，**未发布**） | 104,876,277 B / 31 文件 / sha256 `6aadffc4…7982`；Electron v33，双击 `GoFor.exe`；**固定端口 47821**。已发布的是 `v0.2.6-p2`（对应 740e3b9，不含备注布局修复） |
| `release/GoFor-debug.apk` | ⏸ 暂时停打（用户要求：先只做 Windows，Android 后期适配） | 4.6 MB（4,622,941 B），`app.gofor.study` v1.0，minSdk 24 / targetSdk 36；纯 WebView 壳 |
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

测试：core 348 + store 42 + vision 41 = **431 单测**；e2e **105 项**（含条码兜底、打卡行、课程备注、定位块、日期范围联动、每天预览、备注框自适应）。

### 第三批反馈修复（2026-xx）

| 反馈 | 处理 |
|---|---|
| 选完标签建完任务会自动清空标签 | 提交后不清空（面板展开状态也不动）；标签会带到下一条，随时可点掉。e2e 断言「新任务真的继承了标签」，只测界面计数会漏掉"界面留着、数据没写" |
| 要能改「当前时间」调试（后期删） | 宿主层 `appClock` + 侧栏「调试 · 当前时间」面板：只偏 `now()`，`monotonic`/定时器原样转发（偏了会算坏运行中的番茄钟）；偏移存 localStorage，应用后 reload；`TODO(debug-clock)` 可 grep，三步删除法在 `docs/LATER.md` |
| 首页要打卡提示 | 首页「打卡提示」：今天该打未打的项，可就地勾完并显示 `已完成 x/y`；**只读 `habitLogs`**，不看番茄钟 |
| 首页要看当天课表 | 首页「今日课表」：起止时间 + 科目，复用 App 里给打印层算好的同一份 schedule；今天没课明确写「今天没有课」 |
| 课表备注会挤掉科目名/结束时间 | 备注框随内容变宽，但**不再设百分比上限**（上限会把空闲宽度浪费掉）；改用 flex 收缩兜底：科目名 `min-w-16` + `truncate`（≥64px，超出省略号）、结束时间 `shrink-0`、整行 `min-w-0 overflow-hidden`。e2e 加「长备注不挤掉科目名」「长备注不顶掉结束时间」两条断言 |

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

### 使用反馈第二批（2026-xx）：可用性修复 + 设计系统

| 反馈 | 处理 |
|---|---|
| 课节只能排在最后、没有顺序校验 | `core/timetable/edit` 新增 `insertPeriodAt` / `movePeriod` / `validatePeriods` / `validateRules`（+26 测试）；作息表每行 ↑/↓/「在下方插入」，非法时红字且**不落库** |
| 规则太多把周视图淹掉 | 外壳顺序改为 学期作息表 → **周视图** → 课程与规则；规则列表加「科目 / 星期 / 每周·单周」三个筛选（只过滤显示，不改数据） |
| 课表每次都要点保存 | 改动后 **600ms 防抖自动保存**；写库前校验，状态显示 正在保存/已自动保存 HH:mm/有错误未保存/失败；离页 flush；保留「立即保存」兜底 |
| 番茄钟放弃要点两次 | 改为**长按 5 秒**：按钮内进度填充（`scaleX`，不参与布局），松开/移出/失焦/切页即取消；Enter/Space 长按同效 |
| 打印页不能换模板、模板页打的不是当前模板 | `config.print.template` 成为**唯一来源**（旧配置由 zod 补默认 `day`）；打印页下拉（内置+校准+我的模板）与纸张都写配置；模板页「打印这个模板」先写配置再等两帧打印 |
| 系统打印框之前没有预览 | 应用内 `PrintPreviewDialog`：与真实打印**同一份** blocks/paper/data，多页翻页，底部提示选纸/100%/关页眉页脚/背景图形 |
| 改纸张只改了 UI，实际仍按 A4 打 | 根因不是 `@page`（内联 `@page` 实测会变），而是**选择只活在本地 state、没进 config**；修好后 PDF 实测：A4 594.96×841.92pt、A5 420×594.96pt、A6 298.08×420pt |
| 拍照识别是否真能读出内容 | e2e 新增断言：解析出的**日期**等于纸面日期；识别出**作业行内容**（按打印时固化的 label）与**三格自评区块**；A5 纸张同样按坐标采样 |
| 需要统一的样式体系 | Tailwind v4 **CSS-first** `@theme` token（颜色/圆角/阴影/字号/间距/动效 + `prefers-reduced-motion`）+ 新建 `packages/ui` 18 个组件；共享组件与屏幕逐步迁移；规则写进 AGENTS 第 11 条 |

### 设计系统（2026-xx）

- `apps/web/src/styles.css` 的 `@theme`：颜色（ink/paper/accent/muted/line/danger/ok/warn）、
  圆角（sm/md/lg/xl/2xl/full）、阴影（card/pop）、字号（title/section/body/small/caption/micro/metric）、
  间距语义、动效（duration-fast/base/slow + ease-standard/enter/exit + fade-in/pop-in），
  并有 `prefers-reduced-motion` 归零。
- `packages/ui`：18 个组件（Button/IconButton/Card/Section/Field/Input/Select/Textarea/Checkbox/
  Badge/Chip/StatCard/Modal/ProgressBar/EmptyState/Divider + cn/focusRing），零第三方依赖。
- 已迁移：Sidebar / BackupBanner / ErrorBoundary / CommandPalette / Home / Tasks / Checkin /
  Checklist / DataScreen / Scan / scan 三个组件 / ComingSoon / DebugPanel；Pomodoro/Timetable/
  PrintScreen/TemplateEditor 自身用 token 类名。
- **未迁（下一批）**：Diary / Mood / Report / Toolbox（这四屏仍用旧的自定义 Tailwind 类）。
- 规则写进 `AGENTS.md` 第 11 条与 `docs/DESIGN-SYSTEM.md`：新代码一律 `@gofor/ui` + token 类名，
  禁止 `text-[Npx]` / `border-black/[0.0x]` / `shadow-2xl` / 裸色值；Tailwind v4 是 CSS-first，
  **没有也不该有 `tailwind.config.js`**。

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
| 自我周报 | `screens/Report.tsx` | 本周学习分钟、科目 Top、打卡率、三滑块均值、练习次数、分心次数；复习完成度标「P4 接入」 |
| 数据与备份 | `screens/DataScreen.tsx` | 导出/导入、存储是否被承诺保留、上次备份时间；横幅上也直接给「从备份导入」 |

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

P1 / P2 已完成（含 P2-2.12 条码、2.13 打卡行、2.15 课程备注、2.16 深色主题）。下一阶段按 ROADMAP 进 P3：

1. **P3 插件化**：内容模块（notebook / wordbook / file-view）、转换器/连接器契约
2. **扫描准确性欠账**：格子勾选识别仍不稳（P2-2.17 定位点 + 区块条码，计划中未实现）；
   在它落地前，扫描结果仍需逐条确认，不要当成事实
3. 用户已确认但未实现：文件柜（P5）、单词库 v1（P4）、转换插件（P5）、QQ 连接器（P7）

## 踩过并修掉的坑（别再犯）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| 在 `liveQuery` 里写库 | `ReadOnlyError`，整棵组件树白屏 | 配置读取拆成 `readConfig`（只读）/ `currentConfigOrDefault`（启动时修复一次） |
| 打印层嵌在 `.screen-only` 里 | 打出来是白纸（PDF 只有 938 字节） | `PrintLayer` 必须渲染在 `.screen-only` **之外**；e2e 用 PDF 体积 + 渲染兜住 |
| `@gofor/core` 根导出带 zod | 只用到时钟的宿主也打进 46KB zod | 子路径导出：`@gofor/core/config`、`/print`、`/paper`、`/domain` |
| 往已发布的 Dexie 版本里加表 | 老库不会补建，运行时「表不存在」 | 必须新开 `version(N+1)`；已补 v2→v3 迁移测试 |
| 主 session 里跑 build/e2e/下载 | 用户白等 10–40 分钟，上下文被日志淹没 | **长任务一律子代理或后台作业**，见 AGENTS.md §0 |
| 打印时不固化坐标、扫描时现算 | 中间改过作业顺序，勾选会被记到别人头上（静默错数据） | 进入打印页就存 `sheetManifests` 快照；按「模板@日期@纸张」键覆盖 |
| 打印选择只活在组件 state | 模板/纸张「改了但打出来还是旧的」：打印层只读 config，本地 state 永远到不了纸面 | 打印相关的选择一律写 `config`（`print.template` / `print.paper`），页面只做展示 |
| e2e 用 `page.pdf` 量纸张不带 `preferCSSPageSize` | Chromium 一律给 Letter（612×792pt），会误判"纸张没生效" | `page.pdf({ preferCSSPageSize: true })`，再解析 `/MediaBox` 断言尺寸 |
| Windows 壳用 `listen(0)` 随机端口 | 每次启动 origin 变化 → IndexedDB 按 origin 隔离 → 用户看到「关掉窗口数据全丢」 | 固定端口 47821 + 单实例锁；任何壳/本地服务**都不能用随机端口承载应用** |
| 备份/导入只藏在 ⌘K 里 | 用户找不到恢复入口，丢数据时以为没救 | 新增「数据与备份」页（导出/导入/存储承诺/上次备份）+ 备份横幅上直接给「从备份导入」 |
| 手写 Code 128 解码 | 真实照片一斜/一糊就解不出，用户两张纸都扫不出来 | 解码改用 ZXing（Apache-2.0，`@zxing/library`），原图直接解 + 结果点做框内校验；手写解码器只留作兜底 |
| 「我的一天」A5 再塞打卡行会翻页 | A5 可用高度 202mm 已经顶满，加 7mm 行直接变 2 页 | `adaptBlocks` 按纸张高度 <230mm 过滤打卡行；A4/B5/Letter 保留 |
| 打卡行采样窗套住印刷名字 | 名字是黑字，会把「没勾」也算成有墨 | 采样窗只覆盖勾选框（5mm），渲染时名字放在窗右侧；manifest 与 PrintSheet 必须同时改 |
| 批量打印按“今天”取数据 | 每张纸的任务/课表/二维码都写错日期，扫回来对不上 | 用 `buildSheetForDate(date)` 逐日构建；打印前逐日 `saveSheetManifest`，再 `window.print()` |
| 深色主题把正文颜色继承到纸面 | 深色下打印预览的标题变成浅灰字，真打出来也可能浅色（白纸浅字） | `.print-root` / `.print-page` 固定 `color:#111`，纸面不跟主题；新增纸面色不要用 token 类 |
| 主题切换只改系统偏好 | 晚上调试要手动深色，系统却是浅色 | 三态（跟随系统/浅色/深色）存在 localStorage，`<html data-theme>` 驱动 token |
| 运行时依赖没带许可证文本 | Apache-2.0 要求随分发附许可证；之前只在 README 提了一嘴 | `apps/web/public/THIRD-PARTY-NOTICES.txt`（组件+全文）随 dist/包分发，「数据与备份」页有入口 |
| 条码印在页边距 | 拍照/框选常把最外圈裁掉，码刚好被裁出画面（e2e 的"重置四角"就复现了） | 印在正文下方（`contentBottom + 1mm`），确保落在用户框的纸里 |
| 「重置四角」内缩 6% | 等于把归一化采样整体往内推 6%，所有格子系统性偏移；二维码/条码也可能被裁 | 内缩改成 2%，只留手柄余量；手动拖角仍是主路径 |
| 二维码只在整张照片上解、不校验位置 | 同一张照片里两张纸（或屏幕上的码）会被当成这次的纸，日期/模板全错 | 解出后按四角外接矩形校验（允许 10% 外溢）；多尺度解码兜大图 |
| 旧版本打印的纸没有坐标快照 | 扫回来直接报「没有坐标记录」，旧纸变废纸 | 给「按当前模板重建坐标」按钮（显式确认 + 待确认页标红），**不静默**用当前数据重建 |
| 二维码印 12mm | 预览截图里只有 29px，jsQR 解不出来；纸上手机也可能扫不出 | 加到 16mm；e2e 用 4 倍像素密度截图当"照片" |
| e2e 只 `server.kill()` 父进程 | 每跑一次漏一个 `vite preview` 占着 4173；下一次 e2e 连上**旧构建**的服务，照样"全绿"（假绿） | `spawn(..., { detached: true })` 后按进程组清；开跑前先查端口，有人应答就直接报错 |
| Biome 扫到 Capacitor 生成的 Java/XML | 4000+ 假错误，`pnpm check` 直接失败 | `biome.json` 的 `files.includes` 排除 `apps/web/android` |
| 用整份 verify 日志 `grep -c "^✓"` 数 e2e 项数 | 多算 2 项（vite build 也打 `✓ 497 modules transformed`、`✓ built in`），文档里的 e2e 数被虚高（曾把 96 记成 98） | 只数 e2e 段：`grep -c "^✓" <e2e 自己的输出>`，或核对 `smoke.mjs` 的 `check()` 调用点 |

## 什么坏了 / 什么没做完

- 无已知崩溃。`apps/web` 还没接路由与 shadcn/ui 组件库（当前是手写 Tailwind）。
- 首屏 bundle **约 1.20 MB（gzip 363 KB）**，单包、无分包；ZXing 是主要增量。PWA 首次加载后走 Service Worker，但手机上首次打开明显变慢。计划：扫描页动态 `import()` ZXing（见 LATER）。
- A4 纸面底部约 1/4 留白（留给手写），不是 bug。

## 怎么跑起来

```bash
# 4173 预览由 systemd 用户服务托管（常驻、崩了自动拉起、开机自启）。
# 注意 unit 里必须 --host 127.0.0.1：WSL2 绑 0.0.0.0 时 Windows 转发只在 [::1]。
systemctl --user status gofor-preview
systemctl --user restart gofor-preview
journalctl --user -u gofor-preview -f
# 重建 dist 即可生效，无需重启服务；不要再用 nohup / & 临时起。

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

2026-10-20 **打印预览与滑块再调整**：多天预览改为横排自适应网格，已选/未选轨道改用 `strong`/`line-strong`；
预览懒加载一次最多 100 天（可“加载更多”）；>31 天警告只在从 ≤31 跨到 >31 时触发一次。


2026-10-20 **打印页二次调整**：日期范围每一天都有独立预览（与真正进纸同一份 `buildSheetForDate`）；
`Slider` 轨道改为「已选 accent / 未选 overlay」两段渐变，位置一眼可见。


2026-10-20 **P2-2.18 二次调整**：打印页单日/范围合并为「开始 / 结束 / 天数滑动条 / 数字输入」一行，实时联动；结束日期可改；滑动条上限 31、数字可超过（弹窗提示，取消恢复上次合法范围）；默认打印明天。`@gofor/ui` 新增 `Slider`，打印页与三格自评统一使用。


2026-10-20 **P2-2.18 指定日期 / 批量打印**：打印页可选“这一天”（默认明天、任意日期）与“范围”（默认今天起，滑动条 1–31 天，数字输入无上限，>31 弹警告）；每张纸独立计算任务/课表/备注/打卡与二维码；批量打印前逐日固化坐标清单，再换打印队列调用 `window.print()`。今天仍沿用“全部任务”，其它日期只印该日到期任务。


2026-10-20 **GitHub Release `v0.2.6-p2` 已发布**（commit `740e3b9`，Windows zip，
sha256 `14cdc2ee…1779`，release notes 含已知问题）：深色主题 / 打卡上纸 / 课程备注 / ZXing 条码。

同日 **P2-2.17 v1**：四角定位块 + 自动找纸 + 勾选框窄采样（详见下一条）。
本地预览包按 `d213d65` 重建（多天逐日预览 + Slider 渐变）：104,879,142 B / 31 文件 /
sha256 `336e843e…`，`testzip` 无错，包内 `index-oNEau1vs.js` 与本地 dist 一致；**未发 Release**。


2026-10-20 **P2-2.17 v1**：每页四角印 3mm 定位块（`FIDUCIAL_*` 常量在 core，打印/扫描共用），
扫描端用 `findFiducialQuad`（vision 连通域）自动找纸，并把定位块中心四角按纸张尺寸外扩到真实纸角；
`checkboxList` 的采样窗从整行缩到勾选框 5mm，减少印刷标题造成的误判。区块条码/块内局部坐标尚未实现。


2026-10-20 **规划（仅文档，未写代码）**：按用户确认，把「文件柜 / 单词库 / 转换插件 / QQ 连接器」
排进后续阶段——P3-3.7/3.8（内容模块与转换器/连接器契约）、P4-4.15/4.16（最小资产层、单词库 v1）、
P5-5.10–5.12（文件柜、笔记附件、转换插件 v1）、P7-7.10（QQ 连接器）。边界与存储策略见
`docs/DECISIONS/0003-library-words-and-plugins.md`。当前仍处 P2，**以上均未实现**。

2026-10-19：P2 扫描链路两处修复。

1. **二维码位置校验**：二维码仍然从整张照片解码（纸张尺寸写在码里，先矫正会循环依赖），
   但解出后按手动四角的**外接矩形**校验（允许 10% 外溢）。明显在框外的码不认，
   避免同一张照片里另一张纸/屏幕上的码把日期与模板带错。顺带加了多尺度解码（原图、
   1/2、1/4、1/8），大图里二维码小的时候多一次机会。
2. **旧纸缺坐标清单**：旧版本打印的纸没有 `sheetManifests` 快照，以前只能看到
   「没有坐标记录」死路。现在给一个显式按钮「按当前模板重建坐标并继续」，
   重建后写回快照；待确认页会标红提醒"行数可能和纸上不同"。**不静默重建**。

按 AGENTS 规则 8，用户提的「Code 128 条码兜底」不在 ROADMAP 当前阶段，
已写进 `docs/LATER.md` 停放，未写代码。

之后在 `de9d878` 上重建了 Windows 包：104,874,251 B / 31 文件 / sha256 `6cc67090…`，
`testzip` 无错；包内 `main.cjs` 固定端口 47821 + 单实例，`apps/web/dist` 的
`index-CIfa11Ce.js` 与包内同名文件哈希一致（`1933733a…`）；
包内 `THIRD-PARTY-NOTICES.txt` 含 ZXing 0.21.3 与 Apache-2.0 全文。

同一天按用户确认补了 **P2-2.13 打卡行区块**（A4/B5 的「我的一天」里印一行勾选框，扫描按 habit id 回填；A5 高度已满自动不显示）与 **P2-2.15 课程备注**（首页课表行可直接写备注，打印在科目名后；存储新增 Dexie v7 `courseNotes`，导出/导入已覆盖；手写备注扫回属 P4 OCR，未做）。**P2-2.14 作业清单区块**因扫描依赖 OCR，按用户要求暂缓到 P4。

同一天按用户确认新增 **P2-2.12 条码兜底**（Code 128）：纸尾印 16 字符短码
（`G1` + `YYMMDD` + 纸张码 + 模板短码 6 位 + 页号），扫描端先二维码（带四角位置校验），
失败再用 ZXing 读条码（真实照片实测可用；手写解码器降为兜底）；短码反查当天、同纸张的坐标清单，找不到时提示重打或按当前模板重建。条码条高 8mm，容忍约 3° 倾斜；许可证文本随包分发。
条码画在**正文下方 1mm**（不贴页边），因为它会被拍照/框选裁掉。另把「重置四角」的
内缩从 6% 改成 2%——6% 等于把所有采样整体往内推，本来就是系统性偏移。
