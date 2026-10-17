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
