/** 组件内部共用的类名拼接：组件自身不产生冲突的工具类，调用方追加的类只做最后兜底。 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** 键盘可见焦点：统一 2px accent 描边，鼠标点击不出现。 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
