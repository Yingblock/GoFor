import { describe, expect, it } from 'vitest';
import { applyJobEvent, applyJobTimeout, createJob, isTerminal, jobStatusLabel } from './job.ts';

/** 三条必测路径：超时、取消、崩溃。加上成功/失败/进度。 */
describe('转换任务状态机', () => {
  it('成功：进度归 1，记录结果', () => {
    let state = createJob('j1', 1000);
    state = applyJobEvent(state, { type: 'progress', value: 0.4 }, 1100);
    state = applyJobEvent(state, { type: 'succeed', result: 'ok' }, 1200);
    expect(state.status).toBe('succeeded');
    expect(state.progress).toBe(1);
    expect(state.result).toBe('ok');
    expect(state.endedAt).toBe(1200);
    expect(isTerminal(state)).toBe(true);
  });

  it('进度只增不减，并夹在 0–1', () => {
    let state = createJob('j1', 0);
    state = applyJobEvent(state, { type: 'progress', value: 0.8 }, 10);
    state = applyJobEvent(state, { type: 'progress', value: 0.3 }, 20);
    state = applyJobEvent(state, { type: 'progress', value: 5 }, 30);
    expect(state.progress).toBe(1);
  });

  it('取消：立即进终态，之后的事件不再改变状态', () => {
    let state = createJob('j1', 0);
    state = applyJobEvent(state, { type: 'cancel' }, 50);
    expect(state.status).toBe('cancelled');
    const after = applyJobEvent(state, { type: 'succeed', result: 'ghost' }, 60);
    expect(after).toBe(state);
    expect(after.result).toBeNull();
  });

  it('超时：到点才失败，没到点原样返回', () => {
    const state = createJob('j1', 1000);
    expect(applyJobTimeout(state, 1500, 2000)).toBe(state);
    const timedOut = applyJobTimeout(state, 3000, 2000);
    expect(timedOut.status).toBe('timed-out');
    expect(timedOut.error).toContain('2000ms');
    expect(isTerminal(timedOut)).toBe(true);
  });

  it('崩溃：Worker 抛错/终止后进 crashed，不影响已结束任务', () => {
    const running = applyJobEvent(createJob('j1', 0), { type: 'crash', error: 'worker died' }, 10);
    expect(running.status).toBe('crashed');
    expect(running.error).toBe('worker died');

    const done = applyJobEvent(createJob('j2', 0), { type: 'succeed', result: 1 }, 5);
    expect(applyJobEvent(done, { type: 'crash', error: 'late' }, 6)).toBe(done);
  });

  it('失败：带错误信息', () => {
    const state = applyJobEvent(createJob('j1', 0), { type: 'fail', error: '坏文件' }, 10);
    expect(state.status).toBe('failed');
    expect(state.error).toBe('坏文件');
  });

  it('每种状态都有中文文案（安装页直接显示）', () => {
    expect(jobStatusLabel('timed-out')).toBe('超时');
    expect(jobStatusLabel('crashed')).toBe('转换器崩溃');
    expect(jobStatusLabel('cancelled')).toBe('已取消');
  });
});
