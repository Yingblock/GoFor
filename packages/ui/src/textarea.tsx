import type { Ref, TextareaHTMLAttributes } from 'react';
import { cn, focusRing } from './cn.ts';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid = false, className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'block w-full resize-y rounded-md border bg-white/70 px-3 py-2 text-body leading-relaxed outline-none transition duration-fast ease-standard placeholder:opacity-40 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line focus:border-ink/25',
        focusRing,
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
