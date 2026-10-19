import type { Ref, SelectHTMLAttributes } from 'react';
import { cn, focusRing } from './cn.ts';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/** 原生 select：选项列表交给系统弹，不自己造下拉（移动端体验最稳）。 */
export function Select({ invalid = false, className, ref, ...rest }: SelectProps) {
  return (
    <select
      ref={ref}
      className={cn(
        'block w-full rounded-md border bg-card-soft px-3 py-2 text-body outline-none transition duration-fast ease-standard focus:bg-card disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line focus:border-strong/25',
        focusRing,
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
