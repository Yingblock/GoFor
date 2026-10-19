import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink/[0.06] text-ink/60',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/10 text-danger',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

/** 只读状态标签。可点/可移除的用 Chip。 */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-micro whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
