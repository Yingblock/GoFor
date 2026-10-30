import { type Clock, systemClock } from '@gofor/core';

/**
 * 临时调试设施：把"现在"往前/往后拨。
 *
 * 用途：真机上验证依赖"今天/明天"的界面（课表、打卡、打印时间戳等）。
 * 偏移量存在 localStorage，刷新后依然生效；应用后调用方负责 `location.reload()`，
 * 让在渲染时算日期键（`dateKey(clock)`）的界面按新的"今天"重新渲染。
 *
 * TODO(debug-clock): 上线前删除。删除步骤：
 * 1. 把 `appClock` 改为直接转发 `systemClock`（或让宿主重新 import `systemClock`）；
 * 2. 删除 `apps/web/src/components/DebugPanel.tsx`；
 * 3. 删除 `apps/web/src/components/Sidebar.tsx` 里 `<DebugPanel />` 的挂载点。
 *
 * 只偏移 `now()`；`monotonic()` 与定时器必须原样转发——番茄钟的已用时间由
 * monotonic 差值算出，偏移它会把正在跑的番茄钟算坏。
 */

/** localStorage 键。改动会影响已存的调试偏移，别改。 */
const OFFSET_KEY = 'gofor.debug.clockOffsetMs';

/**
 * 当前调试偏移（毫秒）。没有值或值非法时按 0 处理。
 *
 * 读写都包 try/catch：隐私模式下 localStorage 可能直接抛异常，
 * 调试功能绝不能把 App 搞崩。
 *
 * TODO(debug-clock): 上线前删除。
 */
export function getOffsetMs(): number {
  try {
    const raw = globalThis.localStorage.getItem(OFFSET_KEY);
    if (raw === null) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * 写入调试偏移（毫秒）。只写存储，不 reload——由调用方决定何时刷新。
 *
 * TODO(debug-clock): 上线前删除。
 */
export function setOffsetMs(ms: number): void {
  try {
    globalThis.localStorage.setItem(OFFSET_KEY, String(ms));
  } catch {
    // 隐私模式下写不进去；调试功能降级为"本次有效"，不影响 App 运行。
  }
}

/**
 * 把"现在"设成指定时刻：先算出与真实时间的偏移，写入存储后立即刷新。
 *
 * 刷新是必须的：课表/打卡等界面在渲染时算 `dateKey(clock)`，
 * 不 reload 的话它们还停在旧的"今天"。
 *
 * TODO(debug-clock): 上线前删除。
 */
export function applyOffsetTo(targetEpochMs: number): void {
  setOffsetMs(targetEpochMs - Date.now());
  globalThis.location.reload();
}

/**
 * 清除调试偏移并刷新，回到真实时间。
 *
 * TODO(debug-clock): 上线前删除。
 */
export function resetOffset(): void {
  try {
    globalThis.localStorage.removeItem(OFFSET_KEY);
  } catch {
    // 同上：清不掉也不该崩；刷新后若偏移仍在，用户可再点一次。
  }
  globalThis.location.reload();
}

/**
 * 生效时间（带调试偏移），供面板展示。
 *
 * TODO(debug-clock): 上线前删除。
 */
export function effectiveNow(): number {
  return appClock.now();
}

/**
 * 宿主层时钟：`now()` 叠加调试偏移，其余全部原样转发。
 *
 * TODO(debug-clock): 上线前删除（改为直接转发 `systemClock`，宿主改回 import `systemClock`）。
 */
export const appClock: Clock = {
  now: () => systemClock.now() + getOffsetMs(),
  monotonic: () => systemClock.monotonic(),
  setTimeout: (fn, ms) => systemClock.setTimeout(fn, ms),
  clearTimeout: (handle) => systemClock.clearTimeout(handle),
};
