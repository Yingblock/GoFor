import type { InputHTMLAttributes } from 'react';
import { cn, focusRing } from './cn.ts';

export interface SliderProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'min' | 'max' | 'step' | 'onChange'
  > {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
}

/**
 * 滑块。原生 `input[type=range]` + token 配色，和 Checkbox/Input 一样由控件库统一。
 *
 * 只用原生元素的原因：键盘（←/→/Home/End）、读屏、触屏拖动都是浏览器给的，
 * 自绘滑块要重新实现一遍而且很容易做坏可访问性。
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  className,
  disabled = false,
  ...rest
}: SliderProps) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onValueChange(Number(event.target.value))}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-overlay',
        'accent-[var(--color-accent)]',
        // WebKit：去掉原生外观，圆点用 token 色
        '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-strong',
        '[&::-webkit-slider-thumb]:shadow-card',
        // Firefox
        '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full',
        '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-strong',
        focusRing,
        disabled ? 'cursor-not-allowed opacity-50' : '',
        className,
      )}
      {...rest}
    />
  );
}
