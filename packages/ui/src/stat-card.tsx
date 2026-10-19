import type { ReactNode } from 'react';
import { cn } from './cn.ts';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}

/** 统计数字卡：标签 / 值 / 备注，三行固定层级。 */
export function StatCard({ label, value, note, className }: StatCardProps) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-card-soft px-4 py-3 shadow-card', className)}
    >
      <div className="text-caption opacity-45">{label}</div>
      <div className="mt-1 text-metric font-semibold tabular-nums">{value}</div>
      {note ? <div className="mt-0.5 text-micro opacity-35">{note}</div> : null}
    </div>
  );
}
