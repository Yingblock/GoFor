/**
 * 转换任务的有限状态机（P3-3.8）。
 *
 * 为什么单独抽出来：超时、取消、Worker 崩溃这三条路径在 UI 里很难稳定复现，
 * 但它们是转换器最常见的故障。把状态迁移写成纯函数后，三条路径都能单测，
 * 宿主只负责把 Worker 的事件映射成这里的 event。
 *
 * 终态（succeeded / failed / cancelled / timed-out / crashed）之后**不再接受**任何事件：
 * 一个已经取消的任务又"成功"了，会让界面出现幽灵结果。
 */

export type JobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed-out' | 'crashed';

export interface JobState {
  id: string;
  status: JobStatus;
  /** 0–1；只用于进度条，不参与完成判断。 */
  progress: number;
  startedAt: number;
  endedAt: number | null;
  result: unknown;
  error: string | null;
}

export type JobEvent =
  | { type: 'progress'; value: number }
  | { type: 'succeed'; result: unknown }
  | { type: 'fail'; error: string }
  | { type: 'cancel' }
  | { type: 'timeout' }
  | { type: 'crash'; error: string };

export function createJob(id: string, startedAt: number): JobState {
  return {
    id,
    status: 'running',
    progress: 0,
    startedAt,
    endedAt: null,
    result: null,
    error: null,
  };
}

export function isTerminal(state: JobState): boolean {
  return state.status !== 'running';
}

export function applyJobEvent(state: JobState, event: JobEvent, at: number): JobState {
  if (isTerminal(state)) return state;

  switch (event.type) {
    case 'progress': {
      const value = Number.isFinite(event.value) ? event.value : state.progress;
      return { ...state, progress: Math.min(1, Math.max(state.progress, value)) };
    }
    case 'succeed':
      return { ...state, status: 'succeeded', progress: 1, endedAt: at, result: event.result };
    case 'fail':
      return { ...state, status: 'failed', endedAt: at, error: event.error };
    case 'cancel':
      return { ...state, status: 'cancelled', endedAt: at };
    case 'timeout':
      return {
        ...state,
        status: 'timed-out',
        endedAt: at,
        error: `超过 ${Math.max(0, at - state.startedAt)}ms 没有完成`,
      };
    case 'crash':
      return { ...state, status: 'crashed', endedAt: at, error: event.error };
    default:
      return state;
  }
}

/**
 * 超时检查由宿主定时器调用（不是状态机自己计时）。
 * 返回新状态；已经结束或还没超时就原样返回。
 */
export function applyJobTimeout(state: JobState, at: number, timeoutMs: number): JobState {
  if (isTerminal(state)) return state;
  if (at - state.startedAt < timeoutMs) return state;
  return applyJobEvent(state, { type: 'timeout' }, at);
}

/** 给 UI 的一句话状态文案。 */
export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'running':
      return '转换中';
    case 'succeeded':
      return '完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'timed-out':
      return '超时';
    case 'crashed':
      return '转换器崩溃';
    default:
      return status;
  }
}
