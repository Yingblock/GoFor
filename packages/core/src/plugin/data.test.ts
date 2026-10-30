import { describe, expect, it } from 'vitest';
import {
  type DataContractEntry,
  describeDataDependencies,
  findDataProviderConflicts,
  resolveDataContract,
} from './data.ts';

function entry(
  id: string,
  source: 'core' | 'plugin',
  providerId: string,
  version = 1,
): DataContractEntry {
  return {
    id,
    version,
    providerId,
    source,
    query: async () => ({ id, providerId }),
    revision: async () => 1,
  };
}

describe('resolveDataContract', () => {
  it('core 优先于插件，即使插件后注册', () => {
    const entries = [
      entry('sessions.range', 'plugin', 'plugin.a'),
      entry('sessions.range', 'core', 'core'),
    ];
    const resolved = resolveDataContract(entries, 'sessions.range', 1);
    expect(resolved.entry?.providerId).toBe('core');
    expect(resolved.availability).toEqual({
      status: 'available',
      providerId: 'core',
      version: 1,
    });
  });

  it('没有 core 时用已启用插件的 provider', () => {
    const resolved = resolveDataContract(
      [entry('wordbook.entries', 'plugin', 'gofor.wordbook')],
      'wordbook.entries',
      1,
    );
    expect(resolved.entry?.providerId).toBe('gofor.wordbook');
  });

  it('没有 provider → not-installed（界面必须显示未安装，不能当 0）', () => {
    expect(resolveDataContract([], 'wordbook.entries', 1)).toEqual({
      entry: null,
      availability: { status: 'missing', reason: 'not-installed' },
    });
  });

  it('版本不匹配 → version-mismatch', () => {
    const resolved = resolveDataContract(
      [entry('wordbook.entries', 'plugin', 'gofor.wordbook', 2)],
      'wordbook.entries',
      1,
    );
    expect(resolved.entry).toBeNull();
    expect(resolved.availability).toEqual({ status: 'missing', reason: 'version-mismatch' });
  });
});

describe('describeDataDependencies', () => {
  it('逐个给出可用性，可选缺失也如实标注', () => {
    const statuses = describeDataDependencies(
      [
        { id: 'sessions.range', version: 1 },
        { id: 'wordbook.entries', version: 1, optional: true },
      ],
      [entry('sessions.range', 'core', 'core')],
    );
    expect(statuses[0]?.availability.status).toBe('available');
    expect(statuses[1]?.availability).toEqual({ status: 'missing', reason: 'not-installed' });
  });
});

describe('findDataProviderConflicts', () => {
  it('两个插件提供同一个 id 时提示只使用前者', () => {
    const conflicts = findDataProviderConflicts([
      entry('wordbook.entries', 'plugin', 'a'),
      entry('wordbook.entries', 'plugin', 'b'),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain('a');
    expect(conflicts[0]).toContain('b');
  });

  it('core 与插件同名不算冲突（core 本来就有优先权）', () => {
    expect(
      findDataProviderConflicts([
        entry('sessions.range', 'core', 'core'),
        entry('sessions.range', 'plugin', 'a'),
      ]),
    ).toEqual([]);
  });
});
