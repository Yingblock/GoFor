import { describe, expect, it } from 'vitest';
import { validatePluginManifest } from './manifest.ts';

const API = 1;

function baseManifest(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'example.wordbook',
    name: '示例单词库',
    version: '1.0.0',
    apiVersion: API,
    permissions: ['ui.screen', 'storage'],
    ...patch,
  };
}

describe('validatePluginManifest', () => {
  it('接受最小合法 manifest 并只保留已知字段', () => {
    const result = validatePluginManifest({ ...baseManifest(), evil: 'x' }, API);
    expect(result.ok).toBe(true);
    expect(result.manifest).toMatchObject({
      id: 'example.wordbook',
      name: '示例单词库',
      version: '1.0.0',
      apiVersion: API,
      permissions: ['ui.screen', 'storage'],
    });
    expect(result.manifest && 'evil' in result.manifest).toBe(false);
  });

  it('API 版本必须严格相等', () => {
    const result = validatePluginManifest(baseManifest({ apiVersion: 2 }), API);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain('不兼容');
  });

  it('id 格式错误 / 版本号非法要报错', () => {
    expect(validatePluginManifest(baseManifest({ id: 'Bad Id' }), API).ok).toBe(false);
    expect(validatePluginManifest(baseManifest({ version: '1.0' }), API).ok).toBe(false);
    expect(validatePluginManifest(baseManifest({ name: '' }), API).ok).toBe(false);
  });

  it('权限必须是字符串数组；不认识的权限给 warning 但不拦', () => {
    expect(validatePluginManifest(baseManifest({ permissions: 'ui.screen' }), API).ok).toBe(false);
    const result = validatePluginManifest(
      baseManifest({ permissions: ['ui.screen', 'root.everything'] }),
      API,
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.join()).toContain('root.everything');
  });

  it('权限去重', () => {
    const result = validatePluginManifest(
      baseManifest({ permissions: ['ui.screen', 'ui.screen'] }),
      API,
    );
    expect(result.manifest?.permissions).toEqual(['ui.screen']);
  });

  it('依赖范围与自依赖要报错', () => {
    expect(
      validatePluginManifest(baseManifest({ dependencies: { other: 'latest' } }), API).ok,
    ).toBe(false);
    expect(
      validatePluginManifest(baseManifest({ dependencies: { 'example.wordbook': '^1.0.0' } }), API)
        .ok,
    ).toBe(false);
    expect(
      validatePluginManifest(baseManifest({ dependencies: { other: '^1.0.0' } }), API).ok,
    ).toBe(true);
  });

  it('provides / consumes 归一化后保留', () => {
    const result = validatePluginManifest(
      baseManifest({
        provides: {
          data: [{ id: 'wordbook.entries', version: 1, summary: '单词' }],
          screens: ['a'],
          printBlocks: ['checkboxList'],
        },
        consumes: { data: [{ id: 'sessions.range', version: 1, optional: true }] },
      }),
      API,
    );
    expect(result.ok).toBe(true);
    expect(result.manifest?.provides?.data?.[0]?.id).toBe('wordbook.entries');
    expect(result.manifest?.provides?.printBlocks).toEqual(['checkboxList']);
    expect(result.manifest?.consumes?.data?.[0]).toEqual({
      id: 'sessions.range',
      version: 1,
      optional: true,
    });
  });

  it('非对象输入直接失败，不抛', () => {
    expect(validatePluginManifest(null, API)).toMatchObject({ ok: false, manifest: null });
    expect(validatePluginManifest('x', API).ok).toBe(false);
  });
});
