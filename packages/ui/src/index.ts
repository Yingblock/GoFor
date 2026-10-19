/**
 * `@gofor/ui` 公共出口。
 *
 * 宿主只从包根导入：`import { Button, Card } from '@gofor/ui';`
 * 需要自定义样式时优先复用这里导出的 `cn` / `focusRing` 与 `apps/web/src/styles.css`
 * 里 @theme 生成的类名，不要再手写颜色/圆角/阴影的魔法值。
 */
export { Badge, type BadgeProps, type BadgeTone } from './badge.tsx';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button.tsx';
export {
  Card,
  type CardElevation,
  type CardPadding,
  type CardProps,
  type CardTone,
} from './card.tsx';
export { Checkbox, type CheckboxProps } from './checkbox.tsx';
export { Chip, type ChipProps } from './chip.tsx';
export { cn, focusRing } from './cn.ts';
export { Divider, type DividerProps } from './divider.tsx';
export { EmptyState, type EmptyStateProps, type EmptyStateSize } from './empty-state.tsx';
export { Field, type FieldProps } from './field.tsx';
export { IconButton, type IconButtonProps, type IconButtonSize } from './icon-button.tsx';
export { Input, type InputProps, type InputVariant } from './input.tsx';
export { Modal, type ModalProps, type ModalSize } from './modal.tsx';
export { ProgressBar, type ProgressBarProps } from './progress-bar.tsx';
export { Section, type SectionProps } from './section.tsx';
export { Select, type SelectProps } from './select.tsx';
export { StatCard, type StatCardProps } from './stat-card.tsx';
export { Textarea, type TextareaProps } from './textarea.tsx';
