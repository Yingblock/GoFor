import { describe, expect, it, vi } from 'vitest';
import { createManualClock } from './clock.ts';

describe('createManualClock', () => {
  it('按到期时间顺序触发，而不是注册顺序', () => {
    const clock = createManualClock();
    const order: string[] = [];

    clock.setTimeout(() => order.push('b'), 20);
    clock.setTimeout(() => order.push('a'), 10);

    clock.advance(30);

    expect(order).toEqual(['a', 'b']);
  });

  it('同一时刻到期时按注册顺序稳定触发', () => {
    const clock = createManualClock();
    const order: number[] = [];

    clock.setTimeout(() => order.push(1), 5);
    clock.setTimeout(() => order.push(2), 5);
    clock.setTimeout(() => order.push(3), 5);

    clock.advance(5);

    expect(order).toEqual([1, 2, 3]);
  });

  it('推断到期的定时器内部时间是正确的', () => {
    const clock = createManualClock(1000);
    let observed = 0;

    clock.setTimeout(() => {
      observed = clock.monotonic();
    }, 250);

    clock.advance(1000);

    expect(observed).toBe(1250);
  });

  it('可以取消尚未触发的定时器', () => {
    const clock = createManualClock();
    const fn = vi.fn();

    const handle = clock.setTimeout(fn, 10);
    expect(clock.pending()).toBe(1);

    clock.clearTimeout(handle);
    expect(clock.pending()).toBe(0);

    clock.advance(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('未推进到时不触发', () => {
    const clock = createManualClock();
    const fn = vi.fn();

    clock.setTimeout(fn, 100);
    clock.advance(99);

    expect(fn).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(1);

    clock.advance(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('定时器里再设定时器也能被同一次 advance 处理', () => {
    const clock = createManualClock();
    const order: string[] = [];

    clock.setTimeout(() => {
      order.push('outer');
      clock.setTimeout(() => order.push('inner'), 5);
    }, 5);

    clock.advance(20);

    expect(order).toEqual(['outer', 'inner']);
  });

  it('拒绝负数推进', () => {
    const clock = createManualClock();
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });
});
