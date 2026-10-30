import { describe, expect, it } from 'vitest';
import { compareVersions, isValidVersionRange, parseVersion, satisfiesVersion } from './version.ts';

describe('parseVersion', () => {
  it('接受 x.y.z 与 v 前缀、预发布', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' });
    expect(parseVersion('v0.0.1-beta.2')).toMatchObject({ major: 0, minor: 0, patch: 1 });
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('按数字而不是字符串比较', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
  });

  it('预发布排在同版本正式版之前', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1);
  });

  it('非法版本返回 null，而不是悄悄当成 0', () => {
    expect(compareVersions('x', '1.0.0')).toBeNull();
  });
});

describe('satisfiesVersion', () => {
  it('支持 * / 精确 / 比较符', () => {
    expect(satisfiesVersion('1.2.3', '*')).toBe(true);
    expect(satisfiesVersion('1.2.3', '')).toBe(true);
    expect(satisfiesVersion('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesVersion('1.2.4', '1.2.3')).toBe(false);
    expect(satisfiesVersion('1.2.4', '>=1.2.3')).toBe(true);
    expect(satisfiesVersion('1.2.2', '>1.2.3')).toBe(false);
    expect(satisfiesVersion('1.2.3', '<=1.2.3')).toBe(true);
  });

  it('^ 兼容主版本，0.x 时兼容次版本', () => {
    expect(satisfiesVersion('1.9.0', '^1.2.3')).toBe(true);
    expect(satisfiesVersion('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesVersion('0.2.9', '^0.2.3')).toBe(true);
    expect(satisfiesVersion('0.3.0', '^0.2.3')).toBe(false);
  });

  it('~ 兼容次版本', () => {
    expect(satisfiesVersion('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfiesVersion('1.3.0', '~1.2.3')).toBe(false);
  });

  it('多个比较符用空格或逗号表示同时满足', () => {
    expect(satisfiesVersion('1.5.0', '>=1.2.0 <2.0.0')).toBe(true);
    expect(satisfiesVersion('2.0.0', '>=1.2.0, <2.0.0')).toBe(false);
  });

  it('非法版本/范围一律不满足', () => {
    expect(satisfiesVersion('x', '^1.0.0')).toBe(false);
    expect(satisfiesVersion('1.0.0', '^x')).toBe(false);
  });
});

describe('isValidVersionRange', () => {
  it('只校验语法，不判断具体版本', () => {
    expect(isValidVersionRange('^1.2.3')).toBe(true);
    expect(isValidVersionRange('>=1.0.0 <2.0.0')).toBe(true);
    expect(isValidVersionRange('*')).toBe(true);
    expect(isValidVersionRange('latest')).toBe(false);
    expect(isValidVersionRange('^1.2')).toBe(false);
  });
});
