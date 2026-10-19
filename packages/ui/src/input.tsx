import type { InputHTMLAttributes, Ref } from 'react';
import { cn, focusRing } from './cn.ts';

export type InputVariant = 'default' | 'flush';

const BASE =
  'block w-full outline-none transition duration-fast ease-standard placeholder:opacity-40 disabled:cursor-not-allowed disabled:opacity-50';

/** default：常规表单；flush：命令面板那种只有下划线的输入框。 */
const VARIANTS: Record<InputVariant, string> = {
  default: 'rounded-md border bg-card-soft px-3 py-2 text-body focus:bg-card',
  flush: 'rounded-none border-0 border-b bg-transparent px-4 py-3 text-base focus:bg-transparent',
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  variant = 'default',
  invalid = false,
  className,
  ref,
  ...rest
}: InputProps) {
  const border = invalid
    ? 'border-danger focus:border-danger'
    : 'border-line focus:border-strong/25';

  return (
    <input
      ref={ref}
      className={cn(
        BASE,
        VARIANTS[variant],
        border,
        variant === 'default' ? focusRing : '',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
