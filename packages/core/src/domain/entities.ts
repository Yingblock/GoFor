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

export interface Task {
  id: string;
  title: string;
  subjectId: string | null;
  done: boolean;
  /** 截止日期 `YYYY-MM-DD`，无截止为 null。 */
  due: string | null;
  /** 拖拽排序用，越大越靠后。 */
  sortKey: number;
  createdAt: number;
  updatedAt: number;
}

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
