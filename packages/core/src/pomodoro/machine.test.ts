import { describe, expect, it } from 'vitest';
import { createManualClock } from '../clock.ts';
import {
  addInterruption,
  elapsedMs,
  formatClock,
  isComplete,
  pauseRun,
  progress,
  recoverRun,
  remainingMs,
  resumeRun,
  settleRun,
  startRun,
} from './machine.ts';

const MINUTE = 60_000;

function newRun(minutes = 45, wall = 1_000_000) {
  const clock = createManualClock();
  const run = startRun({ id: 'run-1', plannedMs: minutes * MINUTE }, clock, wall);
  return { clock, run };
}

describe('番茄钟：基本计时', () => {
  it('刚开始时已用 0、剩余等于计划', () => {
    const { clock, run } = newRun(45);
    expect(elapsedMs(run, clock)).toBe(0);
    expect(remainingMs(run, clock)).toBe(45 * MINUTE);
    expect(isComplete(run, clock)).toBe(false);
  });

  it('按单调时钟推进', () => {
    const { clock, run } = newRun(45);
    clock.advance(90_000);
    expect(elapsedMs(run, clock)).toBe(90_000);
    expect(remainingMs(run, clock)).toBe(45 * MINUTE - 90_000);
  });

  it('到期后剩余为 0 且已完成', () => {
    const { clock, run } = newRun(45);
    clock.advance(45 * MINUTE);
    expect(remainingMs(run, clock)).toBe(0);
    expect(isComplete(run, clock)).toBe(true);
  });

  it('进度封顶在 1', () => {
    const { clock, run } = newRun(10);
    clock.advance(60 * MINUTE);
    expect(progress(run, clock)).toBe(1);
  });
});

describe('番茄钟：暂停与继续', () => {
  it('暂停后时间冻结', () => {
    const { clock, run } = newRun(45);
    clock.advance(60_000);
    const paused = pauseRun(run, clock);

    clock.advance(10 * MINUTE);
    expect(elapsedMs(paused, clock)).toBe(60_000);
    expect(paused.status).toBe('paused');
  });

  it('继续后从暂停点接着走，不丢失也不多算', () => {
    const { clock, run } = newRun(45);
    clock.advance(60_000);
    const paused = pauseRun(run, clock);
    clock.advance(10 * MINUTE); // 暂停期间的时间不计入

    const resumed = resumeRun(paused, clock);
    expect(elapsedMs(resumed, clock)).toBe(60_000);

    clock.advance(30_000);
    expect(elapsedMs(resumed, clock)).toBe(90_000);
  });

  it('暂停状态不会被再次暂停影响', () => {
    const { clock, run } = newRun(45);
    clock.advance(5_000);
    const paused = pauseRun(run, clock);
    const again = pauseRun(paused, clock);
    expect(again.accumulatedMs).toBe(5_000);
  });
});

describe('番茄钟：分心与结算', () => {
  it('分心计数累加', () => {
    const { run } = newRun();
    expect(addInterruption(addInterruption(run)).interruptions).toBe(2);
  });

  it('完成时固定实际用时', () => {
    const { clock, run } = newRun(45);
    clock.advance(45 * MINUTE + 5_000); // 超时一点
    const done = settleRun(run, clock, 'finished');

    expect(done.status).toBe('finished');
    expect(done.accumulatedMs).toBe(45 * MINUTE + 5_000);
    // 结算之后不再增长
    clock.advance(MINUTE);
    expect(elapsedMs(done, clock)).toBe(45 * MINUTE + 5_000);
  });

  it('放弃也记录实际用时，便于统计中断的番茄', () => {
    const { clock, run } = newRun(45);
    clock.advance(3 * MINUTE);
    const abandoned = settleRun(run, clock, 'abandoned');
    expect(abandoned.status).toBe('abandoned');
    expect(elapsedMs(abandoned, clock)).toBe(3 * MINUTE);
  });
});

describe('番茄钟：后台节流不漂移', () => {
  it('即使中途只有一次 tick，累计也会正确', () => {
    const { clock, run } = newRun(45);
    // 模拟浏览器把定时器节流：时间跳了 20 分钟，但只发生一次回调
    clock.advance(20 * MINUTE);
    expect(elapsedMs(run, clock)).toBe(20 * MINUTE);
  });
});

describe('番茄钟：页面重载后恢复', () => {
  it('monotonic 归零后用墙钟重新锚定', () => {
    const startWall = 1_000_000;
    const clockA = createManualClock(500_000); // 上一进程的单调时钟
    const run = startRun({ id: 'r', plannedMs: 45 * MINUTE }, clockA, startWall);
    clockA.advance(5 * MINUTE);
    const beforeReload = elapsedMs(run, clockA);
    expect(beforeReload).toBe(5 * MINUTE);

    // 新进程：monotonic 从 0 开始，墙钟过了 5 分钟
    const clockB = createManualClock(0);
    const recovered = recoverRun(run, clockB, startWall + 5 * MINUTE);

    expect(elapsedMs(recovered, clockB)).toBe(5 * MINUTE);
    clockB.advance(MINUTE);
    expect(elapsedMs(recovered, clockB)).toBe(6 * MINUTE);
  });

  it('墙钟倒退时不产生负数累计', () => {
    const startWall = 1_000_000;
    const clockA = createManualClock();
    const run = startRun({ id: 'r', plannedMs: 10 * MINUTE }, clockA, startWall);

    const clockB = createManualClock(0);
    const recovered = recoverRun(run, clockB, startWall - 60_000);
    expect(elapsedMs(recovered, clockB)).toBe(0);
  });

  it('暂停 → 继续 → 重载，不会把暂停时长算进专注', () => {
    const startWall = 1_000_000;
    const clockA = createManualClock();
    const run = startRun({ id: 'r', plannedMs: 45 * MINUTE }, clockA, startWall);

    clockA.advance(10 * MINUTE); // 专注 10 分钟
    const paused = pauseRun(run, clockA);
    clockA.advance(20 * MINUTE); // 暂停 20 分钟（不应计入）

    const resumeWall = startWall + 30 * MINUTE;
    const resumed = resumeRun(paused, clockA, resumeWall);
    expect(elapsedMs(resumed, clockA)).toBe(10 * MINUTE);

    // 重载：新进程 monotonic 归零，墙钟又过 5 分钟
    const clockB = createManualClock(0);
    const recovered = recoverRun(resumed, clockB, resumeWall + 5 * MINUTE);
    expect(elapsedMs(recovered, clockB)).toBe(15 * MINUTE);
  });

  it('暂停中的运行不需要重新锚定', () => {
    const { clock, run } = newRun(45);
    clock.advance(MINUTE);
    const paused = pauseRun(run, clock);

    const clockB = createManualClock(0);
    const recovered = recoverRun(paused, clockB, 9_999_999);
    expect(recovered).toEqual(paused);
  });
});

describe('番茄钟：格式化', () => {
  it('输出 mm:ss 并向上取整', () => {
    expect(formatClock(45 * MINUTE)).toBe('45:00');
    expect(formatClock(59_400)).toBe('01:00');
    expect(formatClock(1_000)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
  });
});
