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
  const span = Math.max(1, max - min);
  const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));

  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => onValueChange(Number(event.target.value))}
      // 轨道用渐变画“已选/未选”两段；颜色取主题的 strong/line-strong，
      // 与按钮、描边同一套色，不再用 accent 蓝单独一套。
      style={{
        background: `linear-gradient(to right, var(--color-strong) 0%, var(--color-strong) ${percent}%, var(--color-line-strong) ${percent}%, var(--color-line-strong) 100%)`,
      }}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full',
        // WebKit / Firefox 的 track 需要透明，否则会盖住上面的渐变
        '[&::-webkit-slider-runnable-track]:bg-transparent',
        '[&::-moz-range-track]:bg-transparent',
        '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-strong',
        '[&::-webkit-slider-thumb]:shadow-card',
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
