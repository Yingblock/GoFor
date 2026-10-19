import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** 区块标题，渲染成 h2。 */
  title: ReactNode;
  /** 标题右侧的操作（计数、链接按钮等）。 */
  actions?: ReactNode;
  /** 标题下的说明，可选。 */
  description?: ReactNode;
  as?: 'section' | 'div';
  children?: ReactNode;
}

/**
 * 页面区块：标题 + 可选右侧操作 + 内容。
 * 以前每个屏幕都手写 `<section><h2 class="text-sm font-medium opacity-50">…`，
 * 现在统一在这里管标题的字号和间距。
 */
export function Section({
  title,
  actions,
  description,
  as = 'section',
  className,
  children,
  ...rest
}: SectionProps) {
  const Tag = as;
  return (
    <Tag className={cn('block', className)} {...rest}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-section font-medium opacity-50">{title}</h2>
        {actions ? <div className="flex shrink-0 items-baseline gap-3">{actions}</div> : null}
      </div>
      {description ? (
        <p className="mb-3 text-small leading-relaxed opacity-45">{description}</p>
      ) : null}
      {children}
    </Tag>
  );
}
