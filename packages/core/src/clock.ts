/**
 * 可注入的时钟。
 *
 * 领域层**禁止**直接调用 `Date.now()` 或裸 `setTimeout()`：
 * 番茄钟、复习调度、课表 Occurrence 生成全部依赖时间，
 * 而它们必须在测试里被确定性地推进。
 */

/** 定时器句柄。对外不透明，避免上层依赖宿主实现细节。 */
export type TimerHandle = unknown;

export interface Clock {
  /** 当前时间，epoch 毫秒。会被系统时间调整影响，用于"日期"类语义。 */
  now(): number;
  /** 单调递增毫秒数。不受系统时间跳变影响，用于"经过了多少时间"。 */
  monotonic(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const perf = globalThis.performance;

/** 真实系统时钟。宿主层用它，领域层只接收 `Clock` 接口。 */
export const systemClock: Clock = {
  now: () => Date.now(),
  monotonic: () => perf.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

interface Scheduled {
  id: number;
  /** 触发时刻（单调时间）。 */
  at: number;
  fn: () => void;
}

export interface ManualClock extends Clock {
  /** 把时间向前推进 `ms` 毫秒，按顺序触发到期的定时器。 */
  advance(ms: number): void;
  /** 尚未触发的定时器数量（测试断言用）。 */
  pending(): number;
}

/**
 * 手动时钟：测试里用它替代真实时间。
 *
 * 约定：同一时刻到期的定时器按注册顺序触发（稳定排序）。
 */
export function createManualClock(start = 0): ManualClock {
  let t = start;
  let nextId = 1;
  const queue: Scheduled[] = [];

  return {
    now: () => t,
    monotonic: () => t,

    setTimeout(fn, ms) {
      const id = nextId++;
      queue.push({ id, at: t + Math.max(0, ms), fn });
      return id;
    },

    clearTimeout(handle) {
      const index = queue.findIndex((task) => task.id === handle);
      if (index >= 0) queue.splice(index, 1);
    },

    advance(ms) {
      if (ms < 0) throw new RangeError('advance() 不接受负数');
      const target = t + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = queue[0];
        if (!next || next.at > target) break;
        queue.shift();
        t = next.at;
        next.fn();
      }
      t = target;
    },

    pending: () => queue.length,
  };
}
