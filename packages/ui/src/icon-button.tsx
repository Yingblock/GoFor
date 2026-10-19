import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

export type IconButtonSize = 'sm' | 'md';

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-7',
  md: 'size-8',
};

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** 必填：图标按钮没有可见文字，读屏时唯一的名字来源。 */
  'aria-label': string;
  size?: IconButtonSize;
  children?: ReactNode;
}

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md text-ink/50 transition duration-fast ease-standard hover:bg-ink/[0.05] hover:text-ink/80 disabled:pointer-events-none disabled:opacity-40';

/** 纯图标按钮（折叠/关闭/删除）。名字从 `aria-label` 来，不靠 `title`。 */
export function IconButton({
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button type={type} className={cn(BASE, SIZES[size], focusRing, className)} {...rest}>
      {children}
    </button>
  );
}
