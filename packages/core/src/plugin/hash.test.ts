import { describe, expect, it } from 'vitest';
import {
  formatScreenHash,
  isNamespacedId,
  isPluginScreenId,
  parseScreenHash,
  qualifyScreenId,
  splitPluginScreenId,
} from './hash.ts';

describe('hash 路由', () => {
  it('格式化与解析是往返的', () => {
    expect(formatScreenHash('home')).toBe('#/s/home');
    expect(parseScreenHash('#/s/home')).toBe('home');
    expect(parseScreenHash(formatScreenHash('gofor.wordbook/screen'))).toBe(
      'gofor.wordbook/screen',
    );
  });

  it('插件页 id 里有斜杠也必须整段解析', () => {
    expect(parseScreenHash('#/s/gofor.wordbook/screen')).toBe('gofor.wordbook/screen');
  });

  it('空 / 非法 hash 返回 null（宿主退回首页）', () => {
    expect(parseScreenHash('')).toBeNull();
    expect(parseScreenHash('#/s/')).toBeNull();
    expect(parseScreenHash('#/other')).toBeNull();
    expect(parseScreenHash('#/s/%E0%A4%A')).toBeNull();
  });

  it('命名空间拆分只切第一个斜杠', () => {
    expect(splitPluginScreenId('gofor.wordbook/screen')).toEqual({
      pluginId: 'gofor.wordbook',
      screenId: 'screen',
    });
    expect(splitPluginScreenId('home')).toBeNull();
    expect(splitPluginScreenId('/screen')).toBeNull();
    expect(splitPluginScreenId('plugin/')).toBeNull();
    expect(isPluginScreenId('plugin/a/b')).toBe(true);
  });

  it('qualifyScreenId 与 isNamespacedId 一致', () => {
    expect(qualifyScreenId('p', 's')).toBe('p/s');
    expect(isNamespacedId('p', 'p/s')).toBe(true);
    expect(isNamespacedId('p', 'p/')).toBe(false);
    expect(isNamespacedId('p', 'pq/s')).toBe(false);
  });
});
