import { cn } from './cn.ts';

export interface ProgressBarProps {
  /** 0–1；越界会被夹到区间内。 */
  value: number;
  /** 进度条的无障碍名字。 */
  label?: string;
  className?: string;
}

/** 细进度条。宽度变化走 `duration-base`，reduced-motion 下自动归零。 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]', className)}
    >
      <div
        className="h-full rounded-full bg-ink transition-[width] duration-base ease-standard"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
