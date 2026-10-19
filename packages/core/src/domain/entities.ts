/**
 * 领域实体。
 *
 * 全部是纯数据，不含 Dexie / React / 浏览器 API —— 存储实现放在 `@gofor/store`，
 * 这样以后换 SQLite（Tauri）或上云同步时，实体定义不用动。
 */

import type { Clock } from '../clock.ts';

export interface Subject {
  id: string;
  name: string;
  /** 排序权重，小的在前。 */
  order: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  subjectId: string | null;
  done: boolean;
  /** 截止日期 `YYYY-MM-DD`，无截止为 null。 */
  due: string | null;
  /** 选做作业（老师说的"选做/拓展"）。旧数据没有该字段，读取时按 false 处理。 */
  optional?: boolean;
  /** 子任务。旧数据没有该字段，读取时按空数组处理。 */
  subtasks?: Subtask[];
  /** 标签。常驻池是科目，用户还可以自建池。旧数据按空数组处理。 */
  tags?: string[];
  /** 排序用，越大越靠后。 */
  sortKey: number;
  createdAt: number;
  updatedAt: number;
}

/** 把可能缺字段的旧数据补成完整形态。 */
export function normalizeTask(
  task: Task,
): Task & { optional: boolean; subtasks: Subtask[]; tags: string[] } {
  return {
    ...task,
    optional: task.optional ?? false,
    subtasks: task.subtasks ?? [],
    tags: task.tags ?? [],
  };
}

/**
 * 自定义标签池。
 *
 * 科目是**虚拟池**（标签来自 subjects 表），不落这张表——
 * 否则同一门课会有两份数据，改名时必然不一致。
 */
export interface TagPool {
  id: string;
  name: string;
  tags: string[];
}

/** 科目池的固定 id（虚拟池，不存库）。 */
export const SUBJECT_TAG_POOL_ID = 'subjects';

/** 一条学习记录的来源。三种来源产出同一种 `StudySession`。 */
export type SessionSource = 'paperTime' | 'paperGrid' | 'appTimer';

export interface StudySession {
  id: string;
  /** `YYYY-MM-DD`（本地日期）。 */
  date: string;
  /** 当日第几分钟，0–1439；跨零点可大于 1439。 */
  start: number;
  end: number;
  subjectId: string | null;
  taskId: string | null;
  source: SessionSource;
  /**
   * 这次专注里点了多少次「我分心了」（番茄钟的 +1 记录）。
   *
   * 是结算那一刻从番茄运行态抄过来的**快照**：`focusRuns` 在结算后会被删掉，
   * 不抄进学习记录的话分心历史就丢了。旧数据没有这个字段，按 0 处理。
   */
  interruptions?: number;
  createdAt: number;
}

/**
 * 每日打卡。
 *
 * 刻意只存"这一天有没有学"，不存连续天数——连续天数是**算出来的**，
 * 存下来就会在补录历史时出现不一致。
 */
export interface Checkin {
  /** 主键就是日期，一天最多一条。 */
  date: string;
  done: boolean;
  note: string | null;
  updatedAt: number;
}

/**
 * 某个打卡项在某一天的完成情况。
 *
 * 主键用 `${habitId}@${date}`：一天一项最多一条，天然幂等，重复写不会长出重复行。
 */
export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  done: boolean;
  updatedAt: number;
}

/**
 * 持久化的课表。
 *
 * 整份 `TimetableData` 存成一个 JSON，而不是拆成 courses/rules/overrides 三张表：
 * P1 只有手工录入、数据量小（一个学期几十条），拆表带来的查询能力换不来收益，
 * 反而让"改一条规则"要跨表事务。
 */
export interface StoredTimetable {
  /** 学期 id。 */
  id: string;
  data: unknown;
  updatedAt: number;
}

export interface StoredTemplate {
  id: string;
  name: string;
  /** 序列化后的 `PrintTemplate`，见 `@gofor/core/print`。 */
  json: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 本地日期键 `YYYY-MM-DD`。
 *
 * 必须走 `Clock` 而不是 `new Date()`：日历归属（"这算今天还是昨天"）
 * 是番茄钟和打卡的核心语义，测试里必须能钉死。
 */
export function dateKey(clock: Clock): string {
  const now = new Date(clock.now());
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 默认科目。首次启动时播种，用户可改。 */
export const DEFAULT_SUBJECT_NAMES = ['语文', '数学', '英语', '物理', '化学', '生物'] as const;

/* ------------------------------------- P2：纸的回流 + 行为层（本地持久化） */

/**
 * 睡眠 / 心情 / 专注三个 1–5 的自评，**一天一条**。
 *
 * 为什么不是"每次记录一条"：纸上的三格是一天填一次的东西，
 * 存成时间序列会让"今天填过没有"变成一次扫描，而按天覆盖天然幂等。
 */
export interface MoodLog {
  /** 'YYYY-MM-DD'，也是一天唯一的那条记录。 */
  date: string;
  /** 1–5，越大越好（睡眠质量 / 心情 / 专注度）。 */
  sleep: number;
  mood: number;
  focus: number;
  updatedAt: number;
}

/** 情绪日记（本地、标签、可关联当天心情）。 */
export interface DiaryEntry {
  id: string;
  date: string;
  text: string;
  tags: string[];
  /** 独立于三滑块的心情分值 1–5；null 表示只写文字没打心情。 */
  mood: number | null;
  createdAt: number;
}

/** 自助工具箱里的练习种类。 */
export type ToolboxExercise = 'breathing-478' | 'relax' | 'grounding-54321' | 'bodyscan';

/** 一次练习的记录：只记"做了多久"，不做心理评估。 */
export interface ToolboxRun {
  id: string;
  exercise: ToolboxExercise;
  startedAt: number;
  /** null 表示中途退出（也有 value：秒数照记）。 */
  completedAt: number | null;
  /** 实际停留秒数。中途退出也有值，用来区分"打开又关掉"和"做完了"。 */
  seconds: number;
}

/** 环境隔离清单：可编辑的"开始学习前流程"。 */
export interface Checklist {
  id: string;
  name: string;
  /** 条目文字。勾选状态存在 ChecklistLog 里，不在这里。 */
  items: string[];
  createdAt: number;
}

/** 清单某一天的完成情况。 */
export interface ChecklistLog {
  /** `${checklistId}@${date}`，一天一条。 */
  id: string;
  checklistId: string;
  date: string;
  /** 当天勾上的条目文字（存文字不存下标：条目可编辑、顺序会变）。 */
  done: string[];
  updatedAt: number;
}

/** 扫描识别出的一个格子。 */
export interface ScanResult {
  /** 与模板坐标注册表里的 target id 对应，例如 `tasks/3`、`slider/sleep`。 */
  targetId: string;
  /** 写给人看的说明，回填确认列表里显示。 */
  label: string;
  kind: 'checkbox' | 'cell' | 'slider';
  /** 该区域内墨迹占比 0–1（调试与自适应阈值用）。 */
  ink: number;
  /** 是否判定为"已勾选 / 已填"。 */
  selected: boolean;
  /**
   * 关联的数据 id，命名约定见 `applyScanResults`：
   * `task:<id>` / `habit:<id>` / `mood:<sleep|mood|focus>`。
   * 旧数据（P2 之前）没有这个字段，按 null 处理。
   */
  payload?: string | null;
  /** 三滑块回填时的 1–5；其它 kind 没有。 */
  value?: number;
}

/** 一次扫描的结果批次。 */
export interface ScanBatch {
  id: string;
  createdAt: number;
  /** 纸上印的日期（来自二维码），不是扫描发生的时间。 */
  date: string;
  templateId: string;
  paper: string;
  results: ScanResult[];
  /** pending = 等用户确认；applied = 已写进其它表；discarded = 用户丢弃。 */
  status: 'pending' | 'applied' | 'discarded';
  appliedAt: number | null;
  /**
   * 坐标清单从哪来的：
   * - `stored`：打印时固化在库里的（默认，且旧批次没有这个字段也按它处理）；
   * - `rebuilt`：库里没有这张纸的清单（旧版本打印的），按当前模板临时重建。
   *
   * 重建可能与纸上实际行数不同，所以必须在待确认页明确提醒，不能静默。
   */
  manifestSource?: 'stored' | 'rebuilt';
}

/**
 * 打印时固化的坐标清单（`SheetManifest` 的序列化快照）。
 *
 * 为什么必须存下来：回填要按"打印那一刻"的任务顺序把纸上的第 N 行映射回任务 id。
 * 如果扫描时重新推导，中间改过作业顺序就会把勾选记到别人头上——静默错数据。
 * 键是「模板 + 日期 + 纸张」，因为同一天可能换了纸张重打。
 */
export interface SheetManifestRecord {
  /** `${templateId}@${date}@${paper}` */
  id: string;
  templateId: string;
  date: string;
  paper: string;
  /** 序列化的 `SheetManifest`，解析见 `@gofor/core/scan`。 */
  json: string;
  createdAt: number;
}
