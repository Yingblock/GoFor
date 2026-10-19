import type { ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

export interface ChipProps {
  children: ReactNode;
  /** 可点：渲染成 `aria-pressed` 的切换按钮。 */
  onClick?: () => void;
  /** 可移除：右侧出现 ✕。 */
  onRemove?: () => void;
  /** 移除按钮的无障碍名字前缀。 */
  removeLabel?: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

const BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro transition duration-fast ease-standard';

/** 标签片：可点选、可移除，或两者都有。 */
export function Chip({
  children,
  onClick,
  onRemove,
  removeLabel = '移除',
  active = false,
  disabled = false,
  className,
}: ChipProps) {
  const labelName = typeof children === 'string' ? `${removeLabel} ${children}` : removeLabel;

  return (
    <span
      className={cn(
        BASE,
        active ? 'border-ink/20 bg-ink/[0.08] text-ink' : 'border-line bg-white/70 text-ink/60',
        disabled ? 'opacity-50' : '',
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={active}
          className={cn('rounded-full', focusRing)}
        >
          {children}
        </button>
      ) : (
        <span>{children}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={labelName}
          className={cn('rounded-full px-0.5 opacity-50 hover:opacity-100', focusRing)}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
