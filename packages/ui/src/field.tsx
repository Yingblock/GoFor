import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId } from 'react';
import { cn } from './cn.ts';

interface ControlAriaProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  /** 字段名，渲染成 `<label>`。 */
  label: ReactNode;
  /** 控件下方的一行提示（格式说明等）。 */
  hint?: ReactNode;
  /** 校验错误；出现时同时给控件加 `aria-invalid`。 */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** 单个表单控件（Input/Select/Textarea/Checkbox）。 */
  children: ReactNode;
}

/**
 * 表单字段：label + 控件 + 提示/错误。
 *
 * id 由 Field 统一生成并注入控件，hint/error 通过 `aria-describedby` 关联，
 * 调用方不用手写 `htmlFor` / `useId`。
 */
export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const reactId = useId();
  const id = `field-${reactId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<ControlAriaProps>, {
        id,
        ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })
    : children;

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-small font-medium opacity-60">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-micro leading-relaxed opacity-40">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-micro leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
