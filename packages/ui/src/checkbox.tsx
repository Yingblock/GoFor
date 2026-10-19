import type { InputHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** 勾选框。`aria-label` 或外层 `Field` 的 label 必须有一个，否则读屏读不出是什么。 */
export function Checkbox({
  invalid = false,
  className,
  type = 'checkbox',
  ...rest
}: CheckboxProps) {
  return (
    <input
      type={type}
      className={cn(
        'size-4 shrink-0 accent-ink transition duration-fast ease-standard disabled:opacity-50',
        invalid ? 'outline-2 outline-danger' : '',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
