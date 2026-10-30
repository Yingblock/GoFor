import { describe, expect, it } from 'vitest';
import {
  findShortcutConflicts,
  type KeyboardEventLike,
  normalizeShortcut,
  shortcutMatches,
} from './shortcuts.ts';

const NO_MODIFIERS = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

function key(keyName: string, patch: Partial<KeyboardEventLike> = {}): KeyboardEventLike {
  return { key: keyName, ...NO_MODIFIERS, ...patch };
}

describe('normalizeShortcut', () => {
  it('把别名归一化成同一份写法', () => {
    expect(normalizeShortcut('mod+k')).toBe('Mod+K');
    expect(normalizeShortcut('CmdOrCtrl+K')).toBe('Mod+K');
    expect(normalizeShortcut('shift + mod + p')).toBe('Mod+Shift+P');
    expect(normalizeShortcut('esc')).toBe('Escape');
    expect(normalizeShortcut('Space')).toBe('Space');
  });

  it('非法写法返回 null', () => {
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('Mod+')).toBeNull();
    expect(normalizeShortcut('Mod+K+J')).toBeNull();
  });
});

describe('shortcutMatches', () => {
  it('Mod 在 macOS 是 ⌘、其它平台是 Ctrl', () => {
    const mac = { isMac: true };
    const other = { isMac: false };
    expect(shortcutMatches(key('k', { metaKey: true }), 'Mod+K', mac)).toBe(true);
    expect(shortcutMatches(key('k', { ctrlKey: true }), 'Mod+K', mac)).toBe(false);
    expect(shortcutMatches(key('k', { ctrlKey: true }), 'Mod+K', other)).toBe(true);
    expect(shortcutMatches(key('k', { metaKey: true }), 'Mod+K', other)).toBe(false);
  });

  it('修饰键必须完全匹配（多按一个不算命中）', () => {
    expect(
      shortcutMatches(key('k', { metaKey: true, shiftKey: true }), 'Mod+K', { isMac: true }),
    ).toBe(false);
    expect(
      shortcutMatches(key('k', { metaKey: true, shiftKey: true }), 'Mod+Shift+K', { isMac: true }),
    ).toBe(true);
  });

  it('字母大小写不敏感，空格键按 Space 匹配', () => {
    expect(shortcutMatches(key('K', { ctrlKey: true }), 'Ctrl+k', { isMac: false })).toBe(true);
    expect(shortcutMatches(key(' '), 'Space', { isMac: false })).toBe(true);
  });
});

describe('findShortcutConflicts', () => {
  it('不同命令抢同一个键 → 冲突；同一命令重复注册不算', () => {
    const conflicts = findShortcutConflicts([
      { commandId: 'a/one', shortcut: 'Mod+K' },
      { commandId: 'b/two', shortcut: 'mod+k' },
      { commandId: 'a/one', shortcut: 'Mod+K' },
      { commandId: 'c/three', shortcut: 'Mod+P' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ shortcut: 'Mod+K', commandIds: ['a/one', 'b/two'] });
  });

  it('非法绑定被忽略而不是当成冲突', () => {
    expect(findShortcutConflicts([{ commandId: 'a', shortcut: 'nope+' }])).toEqual([]);
  });
});
