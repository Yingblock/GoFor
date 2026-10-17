/**
 * 番茄钟状态机（纯逻辑，零 UI、零平台 API）。
 *
 * 设计要点：**双时钟**。
 * - 运行期计时只用 `clock.monotonic()`：它不受系统改时间影响，且后台节流不会让它变慢。
 * - `startedAtWall` 只在"页面重载后重新锚定"时使用——因为 monotonic 每次加载都归零。
 *
 * 绝对禁止用 tick 累加：浏览器/Android 会在后台节流定时器，
 * 25 分钟的番茄会变成 40 分钟。
 */

import type { Clock } from '../clock.ts';

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';
export type PomodoroStatus = 'running' | 'paused' | 'finished' | 'abandoned';

export interface PomodoroRun {
  id: string;
  phase: PomodoroPhase;
  subjectId: string | null;
  taskId: string | null;
  /** 计划时长（毫秒）。 */
  plannedMs: number;
  /** 当前段的墙钟锚点（Date.now），仅在重载后用于重新锚定。 */
  startedAtWall: number;
  /** 当前段的单调时钟锚点（performance.now）。 */
  startedAtMono: number;
  /** 进入当前段之前已累计的毫秒（暂停会产生累计）。 */
  accumulatedMs: number;
  status: PomodoroStatus;
  /** 分心冲动次数（用户主动点"我分心了"）。 */
  interruptions: number;
  createdAt: number;
}

export interface StartRunInput {
  id: string;
  plannedMs: number;
  phase?: PomodoroPhase;
  subjectId?: string | null;
  taskId?: string | null;
}

export function startRun(
  input: StartRunInput,
  clock: Clock,
  wallNow: number = Date.now(),
): PomodoroRun {
  return {
    id: input.id,
    phase: input.phase ?? 'focus',
    subjectId: input.subjectId ?? null,
    taskId: input.taskId ?? null,
    plannedMs: Math.max(1, Math.round(input.plannedMs)),
    startedAtWall: wallNow,
    startedAtMono: clock.monotonic(),
    accumulatedMs: 0,
    status: 'running',
    interruptions: 0,
    createdAt: wallNow,
  };
}

/** 已过去的毫秒。运行中按单调时钟差值算，暂停时返回累计值。 */
export function elapsedMs(run: PomodoroRun, clock: Clock): number {
  if (run.status !== 'running') return run.accumulatedMs;
  const delta = clock.monotonic() - run.startedAtMono;
  return run.accumulatedMs + Math.max(0, delta);
}

export function remainingMs(run: PomodoroRun, clock: Clock): number {
  return Math.max(0, run.plannedMs - elapsedMs(run, clock));
}

/** 进度 0–1。 */
export function progress(run: PomodoroRun, clock: Clock): number {
  return Math.min(1, elapsedMs(run, clock) / run.plannedMs);
}

export function isComplete(run: PomodoroRun, clock: Clock): boolean {
  return elapsedMs(run, clock) >= run.plannedMs;
}

/** 暂停：把当前已用时长固化进 `accumulatedMs`。 */
export function pauseRun(run: PomodoroRun, clock: Clock): PomodoroRun {
  if (run.status !== 'running') return run;
  return { ...run, status: 'paused', accumulatedMs: elapsedMs(run, clock) };
}

/**
 * 继续：以当前单调时钟重新锚定起点。
 *
 * 同时必须刷新 `startedAtWall`：否则「暂停 → 继续 → 页面重载」时，
 * `recoverRun` 会拿旧的墙钟锚点算出把暂停时长也算进去的累计值。
 * 两个锚点必须成对更新，这是这个状态机最容易漏的一条不变量。
 */
export function resumeRun(
  run: PomodoroRun,
  clock: Clock,
  wallNow: number = Date.now(),
): PomodoroRun {
  if (run.status !== 'paused') return run;
  return {
    ...run,
    status: 'running',
    startedAtMono: clock.monotonic(),
    startedAtWall: wallNow,
  };
}

/** 记一次分心冲动。 */
export function addInterruption(run: PomodoroRun): PomodoroRun {
  return { ...run, interruptions: run.interruptions + 1 };
}

/**
 * 结算：把累计时长固定为实际用时并结束。
 * 完成与放弃共用，区别只在 `status`。
 */
export function settleRun(
  run: PomodoroRun,
  clock: Clock,
  status: 'finished' | 'abandoned',
): PomodoroRun {
  return { ...run, status, accumulatedMs: elapsedMs(run, clock) };
}

/**
 * 页面重载后恢复。
 *
 * monotonic 每次加载归零，所以用墙钟差值把锚点搬回当前进程：
 * `startedAtMono = now - (wallNow - startedAtWall)`。
 * 此后仍用单调时钟计时，只在这一次锚定上信任墙钟。
 */
export function recoverRun(run: PomodoroRun, clock: Clock, wallNow: number): PomodoroRun {
  if (run.status !== 'running') return run;
  const wallDelta = Math.max(0, wallNow - run.startedAtWall);
  return { ...run, startedAtMono: clock.monotonic() - wallDelta };
}

/** 把毫秒格式化成 mm:ss（用于 UI）。 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
