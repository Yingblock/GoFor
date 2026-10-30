# P1 实施方案（构思稿，尚未开工）

> 目标读者：半年前回来的自己 + 帮忙的 AI。
> 状态：**计划，不是实现**。开工前需要用户确认 §7 的四个决策点。
> 依据：`docs/ROADMAP.md` 的 P1 段，本文档做重新基线与落地设计。

---

## 1. 一句话目标

**让你每天真的用它规划一天、专注、并把纸打出来带去学校。**

验收不是"功能做完了"，而是 `WORKFLOW.md` 里的 `gate:real-use`：

> 连续两周每天在纸上打勾 + 至少打印 5 张纸。

没过这一关，不开 P2。

---

## 2. 重新基线：P1 实际还剩什么

ROADMAP 写 P1 共 179h，但其中几项已经在 P0 期间提前落地（因为它们是打印链路的前置）：

| 任务 | 原估 | 现状 | 剩余 |
|---|---|---|---|
| 1.0 应用外壳与导航 | 12h | ✅ 已完成 | 0 |
| 1.9 打印引擎（模板注册/渲染/分页/预览） | 25h | ✅ 主体完成，缺多页与校准 | 3h |
| 1.10 模板 ×5 | 14h | ⚠️ 只有「我的一天」1 个 | 10h |
| 1.14 JSON 导入导出 | 9h | ✅ 已完成 | 0 |
| 1.11 模板编辑器 v0 | 14h | 未开始 | 14h |
| 1.12 打印校准页 | 3h | 未开始 | 3h |
| 1.1 番茄钟状态机 | 20h | 未开始 | 20h |
| 1.2 启动体验 | 12h | 未开始 | 12h |
| 1.3 分心冲动记录 | 4h | 未开始 | 4h |
| 1.4 会话归类 | 8h | 未开始 | 8h |
| 1.5 作业清单增强 | 22h | 部分（只有增删勾选） | 22h |
| 1.6 课表模型 | 18h | 未开始 | 18h |
| 1.7 课表视图 | 20h | 未开始 | 20h |
| 1.8 每日打卡 | 8h | 未开始 | 8h |
| 1.13 科目时长统计 | 8h | 未开始 | 8h |
| 1.15 缓冲 | 4h | — | 4h |

**剩余约 146h ≈ 7.3 周 @20h/wk。**

---

## 3. 三个切片，每片都能独立验收

不要把 P1 当成一个 7 周的大任务——那样两周后你就看不到进展了。

### P1-A：每日闭环（44h ≈ 2.5 周）

| 任务 | 工时 |
|---|---|
| 1.1 番茄钟状态机 | 20 |
| 1.2 启动体验 | 12 |
| 1.3 分心冲动记录 | 4 |
| 1.13 科目时长统计 | 8 |

**为什么先做这块**：现在首页统计里的"今日专注"永远是 0——每日闭环缺的就是这一环。
做完这块，你已经可以"用 App 计时 → 看统计"。

**验收**：连续 3 天用番茄钟记录学习，统计页能看到真实分钟数。

### P1-B：计划与课表（68h ≈ 3.5 周）

| 任务 | 工时 |
|---|---|
| 1.5 作业清单增强（截止/必做选做/子任务/排序） | 22 |
| 1.6 课表数据模型 | 18 |
| 1.7 课表视图 | 20 |
| 1.8 每日打卡 | 8 |

**验收**：周视图能显示单双周与调课；作业能按截止时间排序。

### P1-C：纸面（30h ≈ 1.5 周）

| 任务 | 工时 |
|---|---|
| 1.10 模板补齐（周计划 / 课程表 / 打卡卡 / 口袋卡） | 10 |
| 1.12 打印校准页 | 3 |
| 1.11 模板编辑器 v0 | 14 |
| 1.9 打印引擎剩余 | 3 |

**验收**：能打出 5 种纸，且每台打印机第一次用前能打校准页。

> 顺序建议 A → B → C。若你更想先要"能打印的周计划"，把 C 提到 A 前面也行——
> 但那样会有一段时间"统计是 0"，容易失去动力。

---

## 4. 关键设计

### 4.1 番茄钟状态机

**双时钟**是这个模块唯一值得认真设计的地方：

```ts
interface FocusRun {
  id: string;
  taskId: string | null;
  subjectId: string | null;
  plannedMs: number;
  /** 墙上时钟，只在"恢复锚定"时使用 */
  startedAtWall: number;
  /** 单调时钟，运行期计时只用它（不受系统改时间影响） */
  startedAtMono: number;
  /** 暂停前累计的毫秒 */
  accumulatedMs: number;
  status: 'running' | 'paused';
  interruptions: number;
}
```

规则：

1. **运行期**：`elapsed = accumulatedMs + (clock.monotonic() - startedAtMono)`
2. **暂停**：把当前 elapsed 写进 `accumulatedMs`，`status = 'paused'`
3. **页面重载**（monotonic 会归零）：用墙上时钟重新锚定一次
   `startedAtMono = clock.monotonic() - (Date.now() - startedAtWall)`
   然后在 UI 上标注「若中途改过系统时间，剩余时间可能不准」
4. **tick 只用于刷新 UI**，绝不参与计时。`setTimeout` 被后台节流时显示会停，但时间是对的；
   监听 `visibilitychange` 回来时立即重算
5. **打点**：结束时生成一条 `StudySession`（`source: 'appTimer'`），与纸面记录同构

禁止：用 tick 计数器累加时间（后台节流会让 25 分钟变成 40 分钟）。

### 4.2 数据模型 v2（Dexie `version(2)`）

新增表与索引，**不重写已有数据**：

```ts
this.version(2).stores({
  config: 'key',
  tasks: 'id, done, due, subjectId, sortKey, updatedAt',
  subjects: 'id, order',
  sessions: 'id, date, subjectId, taskId, source, startedAt', // 新增索引，向后兼容
  templates: 'id, name',
  courses: 'id, termId',
  rules: 'id, courseId',
  overrides: 'id, ruleId, date',
  checkins: 'id, date, kind',
  focusRuns: 'id, status',
});
```

原则：

- **升级函数只加不删**。Dexie 的 upgrade 写错会锁库，所以宁可不迁数据。
- `StudySession` 增加 `plannedMs` / `interruptions` / `label`，全部可选（旧数据仍合法）。
- `subjects` 表目前没人用（专注格移出后），但番茄钟要按科目归类，会重新用起来。

### 4.3 课表：Occurrence 算出来，不落库

```ts
interface Course  { id; name; teacher?; location?; color?; termId }
interface Rule    { id; courseId; byDay: number[]; intervalWeeks: 1 | 2; startPeriod; span; group? }
interface Override{ id; ruleId; date; action: 'cancel' | 'move' | 'replace' }
interface WeekPattern { termId; from; to; pattern: 'normal' | 'exam' | 'holiday' }
```

`occurrencesOn(date, data) → Occurrence[]` 是**纯函数**，可单测。

不落库的原因：改一条规则时，落库版本要遍历重写所有未来实例，必然产生脏数据。

**P1 明确不做**：教务系统爬虫、走班组、考试排期（这些记进 LATER）。
只做手工录入 + 单双周 + 调课。

### 4.4 打印模板参数化

现在模板硬编码在 `apps/web/src/App.tsx` 的 `buildSheetBlocks()` 里。
P1 要把它移到 `packages/core/src/print/templates.ts`：

```ts
interface PrintTemplate { id; name; paper; margin; blocks: Block[] }
const BUILTIN_TEMPLATES: PrintTemplate[]
function materialize(template, { tasks, date }): Block[]  // 填充行数与标题
```

这样 P1-C 的"模板编辑器 v0"就只是编辑 `blocks` 数组——**不用重写渲染链路**。

编辑器 v0 只做四件事：增删区块、上下移、改行数、换纸张。**不做自由拖拽**（那是另一个产品）。

### 4.5 UI 接入

- 每个 screen 一个文件，`App.tsx` 用 `switch` 分发（现状已经是这样，保持）
- 番茄钟要跨页存活：用 Dexie 里的 `focusRuns` 作为唯一真相，配一个 `usePomodoro()` hook
- **不引入状态库**（AGENTS 已定：不上 Redux/Zustand）；React state + Dexie 足够

---

## 5. 依赖顺序

```
1.1 番茄钟状态机
 ├─ 1.2 启动体验（依赖 1.1 的状态机）
 ├─ 1.3 分心记录（依赖 1.1 的 interruptions 字段）
 └─ 1.4 会话归类 ── 1.13 统计
1.6 课表模型 ── 1.7 课表视图
1.5 作业清单增强（独立，可并行）
1.10 模板补齐 ─┬─ 1.12 校准页
               └─ 1.11 编辑器 v0
```

能并行的只有 1.5 与 1.1 那一条线。单线程的话按 A → B → C 走即可。

---

## 6. 风险与对策

| 风险 | 后果 | 对策 |
|---|---|---|
| 后台节流导致计时不准 | 用户不再信任番茄钟 | 双时钟 + `visibilitychange` 重算；单测用 `ManualClock` 覆盖 |
| 课表建模过度 | 两周卡在数据模型上 | 先只做单双周 + 调课，走班/考试排期进 LATER |
| 模板编辑器膨胀 | P1-C 变成 P1-∞ | v0 只做四件事，自由拖拽进 LATER |
| Dexie 升级写错 | 锁库/丢数据 | v2 只加表与索引，不迁移数据；升级前先跑 `exportAll` 备份 |
| 动力衰减 | 项目停摆 | 三个切片各自可验收；每片结束都更新 STATE |
| 顺手去做云端 | P1 永远做不完 | P7 之前不碰服务器；导出 JSON 已经够用 |

---

## 7. 开工前需要你确认（四项）

1. **番茄时长**：默认 45+10（跟课时节奏）还是 25+5（经典番茄）？
   我会做成配置项，但需要一个默认值。**建议 45+10**——高中一节课就是 45 分钟。

2. **课表来源**：学校会发电子课表（Excel/图片/日历文件）吗？
   如果不会，P1 只做手工录入，把"拍照识别课表"推迟到 P2。

3. **打卡形式**：只要"今天学了吗"的一个勾，还是要"连续天数 + 21 格习惯卡"？
   **建议先只做一个勾**——纸上已经有打卡格，App 里不必复杂。

4. **切片顺序**：A（番茄钟）→ B（课表）→ C（纸面）确认吗？
   如果你更急着要更多打印模板，可以把 C 提前，代价是统计会有一段时间是 0。

---

## 8. 不建议放进 P1 的东西

写在这里是为了防止开工后又顺手加：

- ❌ 笔记 / 画板（P5）
- ❌ 错题本 / SRS（P4）
- ❌ 拍照回填（P2，需要 CV 管线）
- ❌ 任何联网功能（P7）
- ❌ 专注格（已移出，若无明确批准不恢复）
- ❌ 桌面小组件（P6）
