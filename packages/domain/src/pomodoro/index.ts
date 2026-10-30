/**
 * 番茄运行态的共享类型。
 *
 * 状态机在 `gofor-plugin-pomodoro`；这里只留 `@gofor/store` 持久化与备份需要的形状，
 * 避免 store 反向依赖插件包。
 */
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
