import type { ReactNode } from 'react';
import { cn } from './cn.ts';

export type EmptyStateSize = 'sm' | 'md';

const SIZES: Record<EmptyStateSize, string> = {
  sm: 'py-4',
  md: 'py-6',
};

export interface EmptyStateProps {
  /** 主文案。 */
  title?: ReactNode;
  /** 补充说明。 */
  description?: ReactNode;
  /** 右侧/下方的行动按钮。 */
  action?: ReactNode;
  /** 直接给一段文案（title/description 不够用时）。 */
  children?: ReactNode;
  size?: EmptyStateSize;
  className?: string;
}

/** 空态：虚线框 + 说明，可选一个行动入口。 */
export function EmptyState({
  title,
  description,
  action,
  children,
  size = 'sm',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-line px-4 text-center',
        SIZES[size],
        className,
      )}
    >
      {title ? <p className="text-small font-medium opacity-60">{title}</p> : null}
      {description ? (
        <p className="mt-1 text-caption leading-relaxed opacity-40">{description}</p>
      ) : null}
      {children ? <div className="text-small opacity-40">{children}</div> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
