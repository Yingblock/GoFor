import { cn } from './cn.ts';

export interface DividerProps {
  className?: string;
}

/** 水平分隔线，替代手写的 `border-t border-line`。 */
export function Divider({ className }: DividerProps) {
  return <hr className={cn('border-0 border-t border-line', className)} />;
}
