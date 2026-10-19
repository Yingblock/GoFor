import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-strong text-on-strong hover:bg-strong/90',
  secondary: 'border border-line bg-card-soft text-ink hover:bg-card',
  ghost: 'text-ink/60 hover:bg-ink/[0.05] hover:text-ink/80',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-small',
  md: 'px-4 py-2 text-body',
};

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition duration-fast ease-standard disabled:pointer-events-none disabled:opacity-50';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

/**
 * 全站按钮。默认 `type="button"`：这个应用没有表单提交，忘记写 type 只会让按钮
 * 在表单里变成 submit，默认值把这类意外挡掉。
 */
export function Button({
  variant = 'secondary',
  size = 'sm',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], focusRing, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
