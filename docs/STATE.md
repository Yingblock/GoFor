# STATE — 当前状态（唯一真相源）

> 每次开工先读，每次收工更新。目标：半年没碰项目的人 10 分钟内能继续。

## 现在在哪

**P0–P3.8 完成**，离线闭环已跑通「打印 → 手写 → 拍照扫回来」：作业/课表/打卡/番茄上纸，
纸上有二维码 + 页尾条码 + 四角定位块 + 区块小定位点；支持指定日期/范围批量打印、应用内预览、
深色主题、课表换课、打卡行换行；扫描结果逐条确认后才写库。

**插件架构（P3 → P3.8）**：有两条平面，不要混用。

1. **构建期 UI 插件**：`packages/plugin-api` 定契约（manifest / 权限 / 生命周期 / 页面·命令·插槽·
   主题·数据·内容模块·转换器·扫描回填·OCR·AI，不依赖 React）；宿主 `apps/web/src/plugins/` 做注册表、
   激活顺序、懒加载页面、命名插槽、主题 token、命令；13 个功能插件已拆成独立 workspace 包
   `plugins/<name>`（包名 `gofor-plugin-*`），`@gofor/plugins` 只做聚合；单插件逻辑跟包走
   （番茄状态机、工具箱练习数据、单词库解析器）；共享产品域在 `@gofor/domain`
   （timetable / stats / habits / PomodoroRun）；`@gofor/plugin-kit` 只剩调试时钟与 `useHostData`；
   `@gofor/core` 只剩 clock / id / config / paper / print / scan / plugin 解析；
   `#/s/<id>` 深链 + 旧深链自动跳转；Dexie v8 加 `plugins`/`pluginData`；备份走 `BACKUP_SLICES`。
2. **运行时无头插件**：`@gofor/contracts` 五方法 API（命令/视图插槽/打印模板/getTasks/updateTask）；
   `@gofor/plugin-runtime` 在 Electron 主进程从 `userData/plugins` 用 `createRequire` 加载，
   5s 超时、单插件失败隔离、`reloadPlugins()`、日志 `userData/logs/plugins.log`；`@gofor/plugin-cli`
   提供 `gofor plugin add/remove/list`；视图插槽只传元数据，渲染进程按 `gofor.renderer` 懒加载。
   边界见 `DECISIONS/0008`，手册见 `docs/PLUGIN-RUNTIME.md`。
3. **插件宿主 + 外部插件 v2**：`@gofor/plugin-host`，`0.0.0.0:47822` 监听但只响应 loopback，
   LAN 403；提供 snapshot/reload/run-command/renderer 资源与 CORS。PWA 显式启用后
   （`gofor.externalPlugins=1` / `?external=1`）加载外部插件的页面/主题/插槽/数据/扫描 handler。
   数据仍在各设备 IndexedDB，宿主数据集中未做。见 `DECISIONS/0011`、`0012`、`docs/PLUGIN-HOST.md`。

**纸面契约留在 core**：打印版式引擎、扫描几何（四角 / 条码 / 区块定位点）、校准、数据与备份、
插件管理、应用外壳不插件化（见 `DECISIONS/0006`）。打印区块与扫描 handler 按 owner 归属插件：
插件禁用后区块静默跳过、回填不写库、不标 applied。

仓库 <https://github.com/Yingblock/GoFor>（private）；里程碑 P0–P8 已建，P1 拆成 issues #8–#23。
任务拆解一律以 `docs/ROADMAP.md` 为准，进入阶段后再拆 issue。

验证（`pnpm verify` 全绿 = typecheck + 单测 + build + 浏览器 e2e）：

- ✅ 单测 **577**：core 253 / domain 140 / store 48 / vision 46 / plugin-runtime 18 / plugin-host 2 / plugin-cli 12 / 插件包 58
- ✅ e2e 约 **150** 项（`e2e/smoke.mjs` 的 `check()` 断言）
- ✅ 构建产物：index **756KB**、扫描插件懒加载 chunk **423KB**、CSS **35KB**
- ✅ monorepo `apps/web` + `apps/desktop` + `packages/{core,domain,store,ui,vision,plugin-api,plugin-kit,plugins,contracts,plugin-runtime,plugin-cli}` + `plugins/*`；
  TypeScript strict、Biome、Vitest + Playwright、CI `pnpm verify`

## 打包产物与验收入口

| 产物 | 状态 | 说明 |
|---|---|---|
| `release/GoFor-win-x64.zip` | ⏹ **已停止构建**（用户 2026-10-20 决定；验收在网页 4173 上进行） | 旧包仅作历史：104,880,150 B / 31 文件，不再更新校验值 |
| `release/GoFor-debug.apk` | ⏸ 不再打（Android 后期适配） | 4.6 MB，`app.gofor.study` v1.0，minSdk 24 / targetSdk 36，纯 WebView 壳 |
| `release/README.md` | ✅ | 安装说明与已知限制 |
| 验收入口 | ✅ 固定 | 网页 `http://127.0.0.1:4173/`；正式分发形态是 PWA |

## 下一步做什么

1. **P4 错题本 + SRS**（约 42 轮，见 `docs/ROADMAP.md` P4）：块文档模型、扫描/混排错题、
   FSRS-lite 复习队列、限时套卷、章节密度；`4.14` 用 OCR 回填 P2 欠下的手写内容，
   `4.16` 单词库 v1 已提前到 P3，P4 只差接 SRS。
2. **扫描准确性欠账**：格子勾选识别仍不稳、区块条码仍未做；落地前扫描结果必须逐条确认。
3. **P3 遗留扩展点**：`notebook` / `file-view` 只有契约没有 UI（P4/P5）；转换器只有 Worker 白名单任务，
   Office/LibreOffice 需桌面桥（P5-5.12）；主题按页面生效、插件签名、沙箱/网络权限都进 LATER。

## 什么坏了 / 什么没做完

无已知崩溃。以下是真实欠账，细节与停放位置见 `docs/LATER.md`：

- **扫描精度**：无光照均衡、无实时取景框（靠「重拍一张」与选照片绕过）；区块局部校正只做平移 +
  等比缩放（含小幅旋转），小十字糊掉/被裁时该块退回页面坐标且不报错；真机精度仍待验证。
- **手写内容读不回**：时间登记、`slots` 手写格需要 OCR（P4-4.14）；三格自评已改用 `ratingGrid` 勾选格。
- **包体**：主包 756KB + CSS 35KB（React + core + 插件壳）；扫描插件（含 ZXing）是独立懒加载 chunk 423KB；主包仍偏大，
  手机首次打开慢，之后靠 Service Worker。
- **插件能力边界**：两条平面互不相通——构建期 UI 插件没有运行时安装/侧载；运行时无头插件只有
  命令/插槽/打印模板/任务读写，没有页面/主题/数据契约；无 service facade、公开分发/签名/版本范围；
  主题包全局唯一（按激活顺序取第一个）；插件数据是明文 JSON，随备份导出、不加密不压缩。
- **运行时插件未接渲染进程 UI**：IPC 快照与懒加载 helper 已交付，但 `apps/web` 没有插件列表/插槽渲染；
  `apps/desktop` 的任务桥需要 web 侧安装 `runtimeBridge`（`docs/PLUGIN-RUNTIME.md`）。
  `apps/desktop` 不把 electron 写进依赖，`pnpm start` 需要外部 Electron。
- **插件 UI 缺口**：`notebook` / `file-view` 只有契约，无编辑器/预览器；转换器只有 `markdown-to-text`
  一个 Worker 白名单示例，PWA 下明确显示不能转 Office；首页仍是 core 外壳，只能挂 `home.after-stats`
  等命名插槽（见 `DECISIONS/0004`）。
- **打印区块 owner 只允许内置插件**；扫描 handler 走 owner，缺插件时不写库、不标 applied，
  旧清单按 payload 前缀回退。
- **课表与编辑**：「停课一次」已接，「换课」用规则替换实现（P2-2.19），`move`（挪到别节次）UI 未接；
  作业排序是上下移而非拖拽；模板编辑器只做列表式编辑，不支持自由定位；校准页是近似刻度，无 1mm 尺。
- **情绪日记没有趋势图**，只有列表。
- **调试时钟是临时的**：宿主 `appClock` 可前后拨「现在」（localStorage 持久化），上线前删除；
  代码里有 `TODO(debug-clock)`，三步删除法在 `docs/LATER.md`。
- 路由是手写 40 行 hash 路由，未引 shadcn/ui 组件库（手写 Tailwind + `@gofor/ui`）。
- A4 纸面底部约 1/4 留白（留给手写），不是 bug。

## 关键默认值

- 纸张：**A4**。完整混合版实测约 201mm 高，A5 的 194mm 装不下；A5 留给精简版与口袋卡。
- 专注格（`print.focusGrid` / `focus.unit`）**已撤回**，只剩配置残留；不要据此扩展，见 `docs/LATER.md`。
- 墨迹阈值：扫描实际用 `packages/core/src/scan/classify.ts` 的 `DEFAULT_INK_THRESHOLD = 0.18`；
  `config.inkThreshold`（默认 0.12）**尚未接入**扫描链路（见 `docs/LATER.md`）。
- `scan.autoApply = false`：识别结果进待确认列表，不自动写库。

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
pnpm test        # 单测（core + domain + store + vision + plugins + runtime + cli）
pnpm e2e         # 真实浏览器冒烟 + 生成 e2e/out/day-sheet.pdf（需先 pnpm build）
pnpm typecheck
pnpm build
pnpm check       # Biome 自动修复
pnpm verify      # typecheck + test + build + e2e

# 运行时插件（P3.7）
pnpm --filter @gofor/plugin-runtime build   # Electron 主进程用 dist
pnpm --filter @gofor/plugin-cli build       # 生成 gofor bin
pnpm exec gofor plugin list --user-data /tmp/gofor-user
```

## 踩过并修掉的坑（别再犯）

| 坑 | 症状 | 正确做法 |
|---|---|---|
| 在 `liveQuery` 里写库 | `ReadOnlyError`，整棵组件树白屏 | 配置读取拆成 `readConfig`（只读）/ `currentConfigOrDefault`（启动时修复一次） |
| 打印层嵌在 `.screen-only` 里 | 打出来是白纸（PDF 只有 938 字节） | `PrintLayer` 必须渲染在 `.screen-only` **之外**；e2e 用 PDF 体积兜住 |
| `@gofor/core` 根导出带 zod | 只用到时钟的宿主也打进 46KB zod | 子路径导出：`/config`、`/print`、`/paper`、`/domain` |
| 往已发布的 Dexie 版本里加表 | 老库不补建，运行时「表不存在」 | 必须新开 `version(N+1)`；已补 v2→v3 迁移测试 |
| 主 session 里跑 build/e2e/下载 | 用户白等 10–40 分钟，上下文被日志淹没 | 长任务一律子代理或后台作业（AGENTS §1） |
| 打印不固化坐标、扫描时现算 | 中间改过作业顺序，勾选记到别人头上（静默错数据） | 进打印页就存 `sheetManifests` 快照，键「模板@日期@纸张」 |
| 打印选择只活在组件 state | 模板/纸张「改了但打出来还是旧的」 | 打印相关选择一律写 `config`（`print.template` / `print.paper`） |
| e2e 的 `page.pdf` 不带 `preferCSSPageSize` | Chromium 一律给 Letter，误判「纸张没生效」 | `page.pdf({ preferCSSPageSize: true })` 后解析 `/MediaBox` 断言尺寸 |
| Windows 壳用 `listen(0)` 随机端口 | origin 变化 → IndexedDB 隔离 → 「关掉窗口数据全丢」 | 固定端口 47821 + 单实例锁；任何壳/本地服务都不能用随机端口 |
| 备份/导入只藏在 ⌘K 里 | 用户找不到恢复入口，丢数据时以为没救 | 加「数据与备份」页 + 备份横幅上直接给「从备份导入」 |
| 手写 Code 128 解码 | 真实照片一斜/一糊就解不出，两张纸都扫不出来 | 解码改用 ZXing（Apache-2.0），原图直解 + 结果点框内校验，手写解码器只作兜底 |
| 「我的一天」A5 再塞打卡行 | A5 可用高度 202mm 顶满，加 7mm 行直接变 2 页 | `adaptBlocks` 按纸张高度 <230mm 过滤打卡行；A4/B5/Letter 保留 |
| 打卡行采样窗套住印刷名字 | 名字是黑字，「没勾」也被算成有墨 | 采样窗只覆盖 5mm 勾选框，名字放窗右侧；manifest 与 PrintSheet 同时改 |
| 批量打印按「今天」取数据 | 每张纸的任务/课表/二维码日期都错，扫回来对不上 | 逐日 `buildSheetForDate(date)`，打印前逐日 `saveSheetManifest` |
| 深色主题把正文颜色继承到纸面 | 预览标题变浅灰字，真打出来白纸浅字 | `.print-root` / `.print-page` 固定 `color:#111`，纸面色不用 token 类 |
| 定位点用 `div` + `background` 画 | 只在预览里有、纸上没有（打印默认关「背景图形」） | 改成 SVG 矢量填充；e2e 断言 `svg [data-fiducial]` |
| 主题切换只改系统偏好 | 晚上调试要手动深色，系统却是浅色 | 三态（跟随系统/浅色/深色）存 localStorage，`<html data-theme>` 驱动 token |
| 运行时依赖没带许可证文本 | Apache-2.0 要求随分发附许可证 | `apps/web/public/THIRD-PARTY-NOTICES.txt` 随 dist 分发，数据页有入口 |
| 条码印在页边距 | 拍照/框选把最外圈裁掉，码刚好被裁出画面 | 印在正文下方（`contentBottom + 1mm`），确保落在用户框的纸里 |
| 「重置四角」内缩 6% | 归一化采样整体往内推 6%，所有格子系统性偏移 | 内缩改成 2%，只留手柄余量；手动拖角仍是主路径 |
| 二维码只在整图解、不校验位置 | 同照片里另一张纸的码带错日期/模板 | 解出后按四角外接矩形校验（允许 10% 外溢）+ 多尺度解码 |
| 旧版本打印的纸没有坐标快照 | 扫回来直接报「没有坐标记录」，旧纸变废纸 | 给「按当前模板重建坐标」按钮，显式确认 + 标红，**不静默**重建 |
| 二维码印 12mm | 预览截图只有 29px，jsQR 解不出，手机也难扫 | 加到 16mm；e2e 用 4 倍像素密度截图当「照片」 |
| e2e 只 `server.kill()` 父进程 | 每跑一次漏一个 `vite preview` 占着 4173，连到旧构建「假绿」 | `spawn(..., { detached: true })` 按进程组清；开跑前查端口，有人应答就直接报错 |
| Biome 扫到 Capacitor 生成的 Java/XML | 4000+ 假错误，`pnpm check` 直接失败 | `biome.json` 的 `files.includes` 排除 `apps/web/android` |
| 插件 A 直接读 B 的 `pluginData` | B 禁用/卸载后 A 静默读到空（「本周 0 分钟」） | 互访只走 `DataContract`；缺失显示「未安装」，core 数据也做成 provider |
| 禁用插件时仍 `import()` 它的源码 | 模块顶层代码照常执行，「禁用」是假的 | 禁用状态在 `plugins` 表；禁用后不 import，只从 `manifestJson` 展示信息 |
| 主题包默认启用 | 装好就整站变样，用户以为界面坏了 | 内置主题包默认关闭，只有用户主动启用才覆盖 token |
| hash 整段 `encodeURIComponent` | 深链变成 `#/s/x%2Fscreen`，地址不可读、测试误判 | 按 `/` 分段编码，保留 `/` |
| 主题/CSS 作用域漏到打印层 | 纸面颜色被插件改掉，打印出来浅色字 | token 只挂 `.screen-only`，CSS 由宿主包 `@media screen { @scope }`；e2e 断言纸面 color |
| 用整份 verify 日志 `grep -c "^✓"` 数 e2e | 多算 build 的 `✓`，文档里的 e2e 数虚高 | 只数 e2e 段，或核对 `smoke.mjs` 的 `check()` 调用点 |
| 删 `plugins/<name>` 后手改静态注册表 | 漏删数组项会 `moodPlugin is not defined`，模块顶层抛错导致整页黑屏 | 已改为 Vite `import.meta.glob` 自动发现；不要再手写 `BUILTIN_PLUGINS` |
| 页面开着时重建 dist，旧懒加载 chunk 被删 | 启用一个之前禁用的插件时请求旧 chunk URL；预览把缺失 JS 回退成 index.html，报 `Failed to fetch dynamically imported module`，刷新才恢复 | `build.emptyOutDir:false` 保留旧 chunk 宽限期；SW 不缓存非导航的 text/html；加载失败识别旧构建并自动刷新一次；桌面静态服务对缺失资源返回 404 |
| 侧栏分组展开 effect 依赖 `groups` 数组 | `buildNav` 每次宿主渲染都重建数组，用户点开的分组被立刻收回，看起来「点不开」 | 依赖分组结构指纹 `groupSignature`；只在切页/插件增删时重置 |
| 桌面侧栏用 `md:static` | 页面一滚，整列侧栏跟着走；滚出视口后用户以为「点不开」 | 桌面 `md:sticky md:top-0 md:h-screen md:self-start`；e2e 断言滚动后 top≈0 且分组仍可点 |

## 最近一次更新

- **2026-10-31 外部插件 v2（分支 feat/plugin-host-v2）**：契约增加页面/主题/数据/扫描声明；
  `PluginManager` 快照扩展；PWA external client 从 plugin-host 拉 renderer，合并页面/主题/插槽/
  命令/数据契约/扫描 handler；示例 hello 升级并验证数据、扫描、主题、插槽。外部插件默认关闭，
  插件目录可启用；4173 本机可用，LAN 仍 403；数据仍在本机。
- **2026-10-31 插件宿主阶段一**：新增 `@gofor/plugin-host`，默认绑 `0.0.0.0:47822` 但只响应
  loopback，LAN 返回 403；提供 `/health`、snapshot/reload/run-command 与 renderer 资源路由；
  `--allow-lan` 预留，数据层/CORS/鉴权/PWA 客户端未接。见 `DECISIONS/0011`、`docs/PLUGIN-HOST.md`。
- **2026-10-31 构建期插件自动发现**：`@gofor/plugins` 改用 Vite `import.meta.glob` 扫描
  `plugins/*/src/index.ts`，删除注册表的静态 import 与插件 workspace 依赖；删任意插件目录后
  `pnpm build` 直接生效。逐个删 13 个插件构建并加载页面验证通过。`plugin-test.sh` 保留为
  纯 node + Vite 直连入口。见 `DECISIONS/0010`、`docs/PLUGIN-TEST.md`。
- **2026-10-31 旧 chunk 加载失败修复**：`apps/web/vite.config.ts` 关闭 `emptyOutDir`，重建不再删除上一版
  assets；SW 缓存不再接收非导航请求的 `text/html`；插件页面/插槽加载失败若是旧构建，自动刷新一次，
  仍失败才显示「页面已更新，需要刷新」。桌面静态服务对缺失资源返回 404，不再回退 index.html。
- **2026-10-31 侧栏固定与点开修复**：桌面侧栏从 `md:static` 改为
  `md:sticky md:top-0 md:h-screen md:self-start`，页面滚动不再把导航带走；分组展开 effect
  改依赖分组结构指纹，避免宿主每次渲染把用户点开的分组收回去。e2e 新增两条断言
  （滚动后 top≈0、分组仍可点）。
- **2026-10-31 P3.8 core/domain 分层清理**：`@gofor/core` 去掉 timetable/stats/habits/pomodoro 状态机/
  wellbeing/wordbook，只留原语、配置、纸面契约与插件解析；新增 `@gofor/domain`（timetable/stats/habits/
  PomodoroRun 类型）；番茄状态机/工具箱练习/单词库解析下沉到各自插件包；`plugin-kit` 的
  `todayLabel`/打印模板解析移入 `core/print`，kit 只剩调试时钟与 `useHostData`。单测总数不变（574），
  仅重新分布；web 产物尺寸不变。见 `DECISIONS/0009`、`docs/ROADMAP.md` P3.8。
- **2026-10-30 P3.7 运行时插件系统**：新增 `@gofor/contracts`（五方法 API）、`@gofor/plugin-runtime`
  （userData 扫描/加载/5s 超时/隔离/重载/plugins.log）、`@gofor/plugin-cli`（add/remove/list）、
  `apps/desktop` 最小 Electron 宿主与 `gofor-plugin://` 协议；13 个插件拆成 `plugins/*` workspace 包，
  `@gofor/plugins` 改为聚合，`apps/web`/core 未改；示例 `examples/gofor-plugin-hello` 端到端可加载；
  单测 574，web bundle 尺寸不变。见 `DECISIONS/0008`、`docs/PLUGIN-RUNTIME.md`。
- **2026-10-30 P3.6 插件 npm 包化**：删运行时单文件 JS 加载（Blob/`GoForSDK`/安装 UI），插件与视图迁到
  `@gofor/plugins`，共享件抽到 `@gofor/plugin-kit`；规则落 `PLUGIN_RULES` + `docs/PLUGINS.md` §8；
  模板「加区块」只列可用 kind；主 bundle ~756KB，扫描独立 chunk；`pnpm verify` 全绿。
- **2026-10-30 P3.5 全功能插件化 + 打印/扫描归属**：番茄钟/作业/课表/打卡/扫描迁成构建期功能插件，
  App 的 switch 只剩 home/print/templates/data/plugins；旧深链自动跳、`order` 保持侧栏顺序；
  打印区块加 `provides.printBlocks` 归属、扫描结果按 owner 路由；卸载默认保留 `pluginData`。
- **2026-10-30 P3 插件化**：新建 `packages/plugin-api` 与 `packages/core/src/plugin`（+69 core 单测）；
  宿主注册表 / 激活顺序 / 懒加载 / 插槽 / 主题 token + `@scope` / 命令；Dexie v8 与 `BACKUP_SLICES`；
  边界与取舍见 `DECISIONS/0004` / `0005`。
