import { newId } from '@gofor/core';
import {
  applyJobEvent,
  applyJobTimeout,
  createJob,
  isTerminal,
  type JobEvent,
  type JobState,
} from '@gofor/core/plugin';
import type { ConverterWorkerResponse } from './converter.worker.ts';

export interface ConverterRunOptions {
  workerId: string;
  text: string;
  /** 默认 5 秒：本地文本转换够用，又能让"死循环"快速失败。 */
  timeoutMs?: number;
  onState?: (state: JobState) => void;
}

export interface ConverterRun {
  jobId: string;
  promise: Promise<JobState>;
  cancel(): void;
}

/**
 * 在独立 Worker 里跑一次转换（P3-3.8）。
 *
 * 三条失败路径都在这里落到状态机：
 * - 超时：定时器到点 → `timed-out`，并 terminate Worker；
 * - 取消：用户点取消 → `cancelled`，同样 terminate；
 * - 崩溃：Worker 的 error 事件 → `crashed`。
 *
 * 成功后也 terminate：转换是一次性的，留着 Worker 只会占内存。
 */
export function startConverterRun(options: ConverterRunOptions): ConverterRun {
  const jobId = `convert-${newId()}`;
  const timeoutMs = options.timeoutMs ?? 5000;
  let state = createJob(jobId, Date.now());
  const report = (next: JobState) => {
    state = next;
    options.onState?.(next);
  };

  const worker = new Worker(new URL('./converter.worker.ts', import.meta.url), {
    type: 'module',
  });
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolvePromise: (value: JobState) => void = () => {};
  const promise = new Promise<JobState>((resolve) => {
    resolvePromise = resolve;
  });

  const finish = (event: JobEvent) => {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);
    report(applyJobEvent(state, event, Date.now()));
    worker.terminate();
    resolvePromise(state);
  };

  worker.onmessage = (event: MessageEvent<ConverterWorkerResponse>) => {
    if (settled || event.data.jobId !== jobId) return;
    if (event.data.type === 'done') {
      finish({ type: 'succeed', result: event.data.text ?? '' });
    } else {
      finish({ type: 'fail', error: event.data.message ?? '转换失败' });
    }
  };
  worker.onerror = (event) => {
    finish({ type: 'crash', error: event.message || 'Worker 异常终止' });
  };

  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    report(applyJobTimeout(state, Date.now(), timeoutMs));
    worker.terminate();
    resolvePromise(state);
  }, timeoutMs);

  report({ ...state });
  worker.postMessage({ jobId, workerId: options.workerId, text: options.text });

  return {
    jobId,
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      report(applyJobEvent(state, { type: 'cancel' }, Date.now()));
      worker.terminate();
      resolvePromise(state);
    },
  };
}

/** 供安装页展示：任务是否已经结束。 */
export function isRunFinished(state: JobState): boolean {
  return isTerminal(state);
}
