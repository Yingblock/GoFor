import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';

export type CardTone = 'default' | 'solid' | 'success' | 'danger';
export type CardPadding = 'none' | 'sm' | 'md';
export type CardElevation = 'none' | 'card' | 'pop';

const TONES: Record<CardTone, string> = {
  default: 'border-line bg-white/60',
  solid: 'border-line bg-white',
  success: 'border-ok/25 bg-ok/10',
  danger: 'border-danger/25 bg-danger/10',
};

const PADDINGS: Record<CardPadding, string> = {
  none: '',
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
};

const ELEVATIONS: Record<CardElevation, string> = {
  none: 'shadow-none',
  card: 'shadow-card',
  pop: 'shadow-pop',
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** 语义标签：整块内容用 section，普通容器用 div（默认）。 */
  as?: 'div' | 'section';
  tone?: CardTone;
  padding?: CardPadding;
  elevation?: CardElevation;
  children?: ReactNode;
}

/** 统一容器：圆角、描边、极轻阴影只在 token 里定义一次。 */
export function Card({
  as = 'div',
  tone = 'default',
  padding = 'md',
  elevation = 'card',
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'rounded-lg border',
        TONES[tone],
        PADDINGS[padding],
        ELEVATIONS[elevation],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
