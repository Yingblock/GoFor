# STATE — 当前状态（唯一真相源）

> 每次开工先读，每次收工更新。目标：半年没碰项目的人 10 分钟内能继续。

## 现在在哪

**P0–P3.6 完成**，离线闭环已跑通「打印 → 手写 → 拍照扫回来」：作业/课表/打卡/番茄上纸，
纸上有二维码 + 页尾条码 + 四角定位块 + 区块小定位点；支持指定日期/范围批量打印、应用内预览、
深色主题、课表换课、打卡行换行；扫描结果逐条确认后才写库。

**插件架构（P3 → P3.6）**：`packages/plugin-api` 定契约（manifest / 权限 / 生命周期 / 页面·命令·插槽·
主题·数据·内容模块·转换器·扫描回填·OCR·AI，不依赖 React）；宿主 `apps/web/src/plugins/` 只做注册表、
激活顺序、懒加载页面、命名插槽、主题 token、命令；全部功能插件与视图在 `@gofor/plugins`
（`packages/plugins`），共享时钟/打印模板/数据 hook 在 `@gofor/plugin-kit`；`#/s/<id>` 深链 + 旧深链自动跳转；
Dexie v8 加 `plugins`/`pluginData`；备份走 `BACKUP_SLICES` 注册表。**加一个插件不改核心代码。**

**纸面契约留在 core**：打印版式引擎、扫描几何（四角 / 条码 / 区块定位点）、校准、数据与备份、
插件管理、应用外壳不插件化（见 `DECISIONS/0006`）。打印区块与扫描 handler 按 owner 归属插件：
插件禁用后区块静默跳过、回填不写库、不标 applied。

仓库 <https://github.com/Yingblock/GoFor>（private）；里程碑 P0–P8 已建，P1 拆成 issues #8–#23。
任务拆解一律以 `docs/ROADMAP.md` 为准，进入阶段后再拆 issue。

验证（`pnpm verify` 全绿 = typecheck + 单测 + build + 浏览器 e2e）：

- ✅ 单测 **545**：core 451 / store 48 / vision 46
- ✅ e2e 约 **150** 项（`e2e/smoke.mjs` 的 `check()` 断言）
- ✅ 构建产物：index **756KB**、扫描插件懒加载 chunk **423KB**、CSS **35KB**
- ✅ monorepo `apps/web` + `packages/{core,store,ui,vision,plugin-api,plugin-kit,plugins}`；
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
- **插件能力边界**：插件只随应用构建（无运行时安装/侧载）；无 service facade（插件间不能调方法，
  只有只读 `DataContract`）；无公开分发/签名/版本范围；主题包全局唯一（按激活顺序取第一个）；
  插件数据是明文 JSON，随备份导出、不加密不压缩。
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
pnpm test        # 单测（core + store + vision）
pnpm e2e         # 真实浏览器冒烟 + 生成 e2e/out/day-sheet.pdf（需先 pnpm build）
pnpm typecheck
pnpm build
pnpm check       # Biome 自动修复
pnpm verify      # typecheck + test + build + e2e
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

## 最近一次更新

- **2026-10-30 P3.6 插件 npm 包化**：删运行时单文件 JS 加载（Blob/`GoForSDK`/安装 UI），插件与视图迁到
  `@gofor/plugins`，共享件抽到 `@gofor/plugin-kit`；规则落 `PLUGIN_RULES` + `docs/PLUGINS.md` §8；
  模板「加区块」只列可用 kind；主 bundle ~756KB，扫描独立 chunk；`pnpm verify` 全绿。
- **2026-10-30 P3.5 全功能插件化 + 打印/扫描归属**：番茄钟/作业/课表/打卡/扫描迁成构建期功能插件，
  App 的 switch 只剩 home/print/templates/data/plugins；旧深链自动跳、`order` 保持侧栏顺序；
  打印区块加 `provides.printBlocks` 归属、扫描结果按 owner 路由；卸载默认保留 `pluginData`。
- **2026-10-30 P3 插件化**：新建 `packages/plugin-api` 与 `packages/core/src/plugin`（+69 core 单测）；
  宿主注册表 / 激活顺序 / 懒加载 / 插槽 / 主题 token + `@scope` / 命令；Dexie v8 与 `BACKUP_SLICES`；
  边界与取舍见 `DECISIONS/0004` / `0005`。
