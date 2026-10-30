# P1 · 离线核心闭环的领域模型

## 1. 番茄钟状态机

双时钟是这个模块唯一值得认真设计的地方：`startedAtWall` 只用于恢复锚定，运行期计时只读 `startedAtMono`。

```ts
// packages/core/src/pomodoro/machine.ts
interface PomodoroRun {
  id: string;
  phase: 'focus' | 'shortBreak' | 'longBreak';
  taskId: string | null;
  subjectId: string | null;
  plannedMs: number;
  /** 墙上时钟，只在"恢复锚定"时使用 */
  startedAtWall: number;
  /** 单调时钟，运行期计时只用它（不受系统改时间影响） */
  startedAtMono: number;
  /** 暂停前累计的毫秒 */
  accumulatedMs: number;
  status: 'running' | 'paused' | 'finished' | 'abandoned';
  interruptions: number;
  createdAt: number;
}
```

1. 运行期：`elapsed = accumulatedMs + (clock.monotonic() - startedAtMono)`。
2. 暂停：把当前 elapsed 写进 `accumulatedMs`，`status = 'paused'`。
3. 页面重载（monotonic 归零）：用墙上时钟重新锚定一次 `startedAtMono = clock.monotonic() - (clock.now() - startedAtWall)`，并在 UI 标注「若中途改过系统时间，剩余时间可能不准」。
4. tick 只刷新 UI，绝不参与计时：`setTimeout` 被后台节流时显示会停，但时间是对的；监听 `visibilitychange`，回来立即重算。
5. 打点：结束时生成一条 `StudySession`（`source: 'appTimer'`），与纸面记录同构。
6. 禁止用 tick 计数器累加时间（后台节流会让 25 分钟变成 40 分钟）。

## 2. 数据模型 v2（Dexie `version(2)`）

只加表与索引，**不重写已有数据**：

```ts
this.version(2).stores({
  config: 'key',
  tasks: 'id, done, due, subjectId, sortKey',
  subjects: 'id, order',
  sessions: 'id, date, subjectId',
  templates: 'id, name',
  focusRuns: 'id, status, createdAt',
  checkins: 'date',
  timetables: 'id',        // 整份课表一条文档（见 §3），不是 courses/rules/overrides 三张表
});
```

- 升级函数只加不删：Dexie 的 upgrade 写错会锁库，宁可不迁数据；`StudySession` 只新增可选字段 `interruptions`（旧数据按 0 处理）。
- `subjects` 重新用起来：番茄钟按科目归类需要它。
- 当前库已到 **v8**（v4 打卡项、v5 行为层与 `scanBatches`、v6 `sheetManifests`、v7 `courseNotes`、v8 `plugins`/`pluginData`），**完整表清单以 `packages/store/src/db.ts` 为准**，本节只记 P1 那一步。

## 3. 课表：Occurrence 算出来，不落库

```ts
// packages/core/src/timetable/types.ts
interface Term            { id; startDate; weeks }
interface Course          { id; name; teacher?; location?; color? }
interface Rule            { id; courseId; byDay: number[]; intervalWeeks: 1 | 2; startPeriod; span?; group? }
interface Override        { id; ruleId; date; action: 'cancel' | 'move' | 'replace'; payload? }
interface WeekPatternRange{ from; to; pattern: 'normal' | 'exam' | 'holiday' }
// 以上整份存成 TimetableData 快照，落 `timetables` 表一条记录
```

- `occurrencesOn(date, data) → Occurrence[]` 是**纯函数**，可单测；不落库的原因：改一条规则时，落库版本要遍历重写所有未来实例，必然产生脏数据。
- P1 明确不做：教务系统爬虫、走班组、考试排期（记进 `docs/LATER.md`）；只做手工录入 + 单双周 + 调课。

## 4. 打印模板参数化

`packages/core/src/print/templates.ts` 是模板的单一来源：

```ts
interface PrintTemplate { id; name; paper; margin; blocks: Block[] }
const BUILTIN_TEMPLATES: PrintTemplate[]
function materialize(template, { tasks, date }): Block[]  // 填充行数与标题
```

- 编辑器 v0 只做四件事：增删区块、上下移、改行数、换纸张——只改模板数据（`blocks` / `paper`），渲染链路不动；**不做自由拖拽**（那是另一个产品，记进 `docs/LATER.md`）。

## 5. UI 接入

- 每个 screen 一个文件，`App.tsx` 用 `switch` 分发；P1 时现状如此，保持。
- 番茄钟跨页存活：Dexie 的 `focusRuns` 是唯一真相，配一个 `usePomodoro()` hook。
- **不引入状态库**（不上 Redux/Zustand）：React state + Dexie 足够。
- P3 起功能页改为插件（见 `docs/PLUGINS.md`），本节只记录 P1 的接入方式。

## 6. 三个切片

| 切片 | 范围 | 验收 |
|---|---|---|
| A 每日闭环 | 番茄钟状态机 + 启动体验 + 分心冲动记录 + 科目时长统计 | 连续 3 天用番茄钟记录学习，统计页能看到真实分钟数 |
| B 计划与课表 | 作业清单增强（截止/必做选做/子任务/排序）+ 课表模型与周视图 + 每日打卡 | 周视图能显示单双周与调课；作业能按截止时间排序 |
| C 纸面 | 模板补齐（周计划/课程表/打卡卡/口袋卡）+ 打印校准页 + 模板编辑器 v0 + 打印引擎剩余 | 能打出 5 种纸，且每台打印机第一次用前能打校准页 |
