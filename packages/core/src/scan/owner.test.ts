import { describe, expect, it } from 'vitest';
import { scanResultOwner } from './owner.ts';

describe('scanResultOwner', () => {
  it('新清单优先用 owner', () => {
    expect(scanResultOwner({ owner: 'me.plugin', payload: 'task:t1' })).toBe('me.plugin');
  });

  it('旧清单按 payload 前缀回退', () => {
    expect(scanResultOwner({ payload: 'task:t1' })).toBe('gofor.tasks');
    expect(scanResultOwner({ payload: 'habit:h1' })).toBe('gofor.checkin');
    expect(scanResultOwner({ payload: 'mood:sleep' })).toBe('gofor.mood');
  });

  it('不认识的 payload / 空值返回 null，而不是乱塞给某个插件', () => {
    expect(scanResultOwner({ payload: 'unknown:x' })).toBeNull();
    expect(scanResultOwner({ payload: null })).toBeNull();
    expect(scanResultOwner({})).toBeNull();
    expect(scanResultOwner({ payload: ':x' })).toBeNull();
  });
});
