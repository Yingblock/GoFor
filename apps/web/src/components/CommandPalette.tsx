import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/**
 * 命令面板（Ctrl/⌘ + K）。
 *
 * 为什么值得在 P0 就做：桌面端的效率几乎全在这里。
 * 以后每加一个功能，都先问"它的命令叫什么"，而不是先画按钮。
 */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return commands;
    return commands.filter((command) => command.title.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    void command.run();
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    setActive(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* 背景遮罩：用真正的 button 承载"点击关闭"，避免给静态元素挂事件 */}
      <button
        type="button"
        aria-label="关闭命令面板"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(filtered[active]);
            }
          }}
          placeholder="输入命令…"
          className="w-full border-b border-black/10 px-4 py-3 text-base outline-none"
        />
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm opacity-50">没有匹配的命令</li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(command)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                    index === active ? 'bg-black/[0.06]' : ''
                  }`}
                >
                  <span>{command.title}</span>
                  {command.hint ? <span className="opacity-40">{command.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
