/**
 * 快捷键注册表（纯逻辑）。
 *
 * 目标不是"支持任意组合键"，而是：**插件能声明快捷键，宿主能发现冲突并展示**。
 * 冲突不静默覆盖——否则用户按 Cmd+P 打出别的插件的页面时根本不知道为什么。
 *
 * `Mod` = macOS 的 ⌘、其它平台的 Ctrl；`Ctrl` / `Meta` 表示**指定**那一个键，
 * 两者不能混用（按 Cmd 和按 Ctrl 是不同的物理键）。
 */

export interface ShortcutBinding {
  /** 命令 id（`<pluginId>/<commandId>` 或 core 命令）。 */
  commandId: string;
  shortcut: string;
  /** 展示用：来自哪个插件。 */
  source?: string;
}

export interface ShortcutConflict {
  shortcut: string;
  commandIds: string[];
}

interface ParsedShortcut {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  plus: '+',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
  '+': '+',
  '-': '-',
};

/** 归一化一个快捷键字符串；语法非法返回 `null`。 */
export function normalizeShortcut(binding: string): string | null {
  const parsed = parseShortcut(binding);
  if (!parsed) return null;
  const parts: string[] = [];
  if (parsed.mod) parts.push('Mod');
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.meta) parts.push('Meta');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  parts.push(parsed.key);
  return parts.join('+');
}

function parseShortcut(binding: string): ParsedShortcut | null {
  const raw = binding.trim();
  if (raw === '') return null;
  // `+` 本身作为按键时写成 `Mod++`（末尾两个加号）。先把它替换成占位符，
  // 否则 `Mod+` 这种少写了按键的绑定会被误当成 `+` 键。
  const prepared = raw.endsWith('++') ? `${raw.slice(0, -2)}+PLUS` : raw;
  const tokens = prepared.split('+').map((token) => token.trim());
  if (tokens.length === 0) return null;

  const parsed: ParsedShortcut = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: '',
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    const lower = token.toLowerCase();
    if (lower === '') return null;
    if (lower === 'mod' || lower === 'cmdorctrl') {
      parsed.mod = true;
      continue;
    }
    if (lower === 'ctrl' || lower === 'control') {
      parsed.ctrl = true;
      continue;
    }
    if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      parsed.meta = true;
      continue;
    }
    if (lower === 'alt' || lower === 'option') {
      parsed.alt = true;
      continue;
    }
    if (lower === 'shift') {
      parsed.shift = true;
      continue;
    }
    if (parsed.key !== '') return null; // 两个非修饰键
    parsed.key = NAMED_KEYS[lower] ?? (token.length === 1 ? token.toUpperCase() : token);
  }

  if (parsed.key === '') return null;
  return parsed;
}

export interface KeyboardEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * 判断一次按键是否命中某个绑定。
 *
 * `isMac` 由调用方传入（浏览器层用 `navigator.platform`），这样这个函数
 * 在 Node 单测里可以同时验证两个平台的语义。
 */
export function shortcutMatches(
  event: KeyboardEventLike,
  binding: string,
  options: { isMac: boolean },
): boolean {
  const parsed = parseShortcut(binding);
  if (!parsed) return false;

  const expectedMeta = parsed.meta || (parsed.mod && options.isMac);
  const expectedCtrl = parsed.ctrl || (parsed.mod && !options.isMac);
  if (event.metaKey !== expectedMeta) return false;
  if (event.ctrlKey !== expectedCtrl) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.shiftKey !== parsed.shift) return false;

  const eventKey = event.key === ' ' ? 'Space' : event.key;
  return eventKey.toLowerCase() === parsed.key.toLowerCase();
}

/**
 * 找出重复绑定。
 *
 * 同一个命令被注册两次不算冲突（例如内置插件被重新激活），
 * 不同命令抢同一个组合键才算。
 */
export function findShortcutConflicts(bindings: readonly ShortcutBinding[]): ShortcutConflict[] {
  const groups = new Map<string, ShortcutBinding[]>();
  for (const binding of bindings) {
    const normalized = normalizeShortcut(binding.shortcut);
    if (normalized === null) continue;
    const list = groups.get(normalized) ?? [];
    list.push(binding);
    groups.set(normalized, list);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [shortcut, list] of groups) {
    const commandIds = [...new Set(list.map((binding) => binding.commandId))];
    if (commandIds.length > 1) conflicts.push({ shortcut, commandIds: commandIds.sort() });
  }
  return conflicts.sort((a, b) => a.shortcut.localeCompare(b.shortcut));
}
