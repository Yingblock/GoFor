import { describe, expect, it } from 'vitest';
import { type PluginDescriptor, resolvePluginOrder } from './resolve.ts';

function plugin(id: string, patch: Partial<PluginDescriptor> = {}): PluginDescriptor {
  return { id, version: '1.0.0', enabled: true, ...patch };
}

describe('resolvePluginOrder', () => {
  it('依赖先激活，顺序稳定', () => {
    const result = resolvePluginOrder([
      plugin('b', { dependencies: { a: '^1.0.0' } }),
      plugin('a'),
    ]);
    expect(result.order).toEqual(['a', 'b']);
    expect(result.blocked).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it('没有依赖时按 id 排序，保证同一输入同一输出', () => {
    const result = resolvePluginOrder([plugin('c'), plugin('a'), plugin('b')]);
    expect(result.order).toEqual(['a', 'b', 'c']);
  });

  it('硬依赖缺失 → 不启用并说明原因', () => {
    const result = resolvePluginOrder([plugin('b', { dependencies: { a: '^1.0.0' } })]);
    expect(result.order).toEqual([]);
    expect(result.blocked).toEqual(['b']);
    expect(result.problems[0]).toMatchObject({
      pluginId: 'b',
      kind: 'missing-dependency',
      dependencyId: 'a',
    });
  });

  it('依赖被禁用 → 依赖方也不启用（不能跳过依赖自己跑）', () => {
    const result = resolvePluginOrder([
      plugin('a', { enabled: false }),
      plugin('b', { dependencies: { a: '^1.0.0' } }),
    ]);
    expect(result.order).toEqual([]);
    expect(result.problems[0]).toMatchObject({ pluginId: 'b', kind: 'disabled-dependency' });
  });

  it('传递阻塞：A→B→C 缺 C 时三个都不启用', () => {
    const result = resolvePluginOrder([
      plugin('c', { dependencies: { missing: '1.0.0' } }),
      plugin('b', { dependencies: { c: '^1.0.0' } }),
      plugin('a', { dependencies: { b: '^1.0.0' } }),
    ]);
    expect(result.order).toEqual([]);
    expect(result.blocked).toEqual(['a', 'b', 'c']);
  });

  it('版本不满足 → 不启用', () => {
    const result = resolvePluginOrder([
      plugin('a', { version: '1.0.0' }),
      plugin('b', { dependencies: { a: '^2.0.0' } }),
    ]);
    expect(result.order).toEqual(['a']);
    expect(result.problems[0]).toMatchObject({ pluginId: 'b', kind: 'version-mismatch' });
  });

  it('可选依赖缺失不算错；存在时排在它后面', () => {
    const missing = resolvePluginOrder([plugin('a', { optionalDependencies: ['x'] })]);
    expect(missing.order).toEqual(['a']);
    expect(missing.problems).toEqual([]);

    const present = resolvePluginOrder([plugin('a', { optionalDependencies: ['x'] }), plugin('x')]);
    expect(present.order).toEqual(['x', 'a']);
  });

  it('依赖成环 → 环上插件都不启用，不死循环', () => {
    const result = resolvePluginOrder([
      plugin('a', { dependencies: { b: '^1.0.0' } }),
      plugin('b', { dependencies: { a: '^1.0.0' } }),
    ]);
    expect(result.order).toEqual([]);
    expect(result.blocked).toEqual(['a', 'b']);
    expect(result.problems.every((problem) => problem.kind === 'dependency-cycle')).toBe(true);
  });

  it('重复 id：只保留第一个，并报告重复', () => {
    const result = resolvePluginOrder([plugin('a'), plugin('a', { version: '2.0.0' })]);
    expect(result.order).toEqual(['a']);
    expect(result.problems[0]).toMatchObject({ pluginId: 'a', kind: 'duplicate-id' });
  });

  it('版本字符串非法 → 不启用', () => {
    const result = resolvePluginOrder([plugin('a', { version: 'latest' })]);
    expect(result.order).toEqual([]);
    expect(result.problems[0]).toMatchObject({ kind: 'invalid-version' });
  });
});
