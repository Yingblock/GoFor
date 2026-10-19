import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn, focusRing } from './cn.ts';

export type ModalSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** 遮罩与右上角关闭按钮的无障碍名字。 */
  closeLabel?: string;
  className?: string;
}

/**
 * 模态框：遮罩 + 卡片，Esc 关闭，关闭后焦点回到触发它的元素。
 *
 * 焦点恢复用 ref 记录 `document.activeElement`，不用额外的 trigger ref，
 * 因此任何按钮/输入框打开弹层都自动可用。
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeLabel = '关闭',
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? panel)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const trigger = restoreRef.current;
      restoreRef.current = null;
      // 触发元素可能已经随页面卸载；只有还挂在文档上时才恢复焦点。
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => closeRef.current()}
        className="absolute inset-0 cursor-default bg-scrim animate-fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-line bg-card shadow-pop animate-pop-in',
          SIZES[size],
          focusRing,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-section font-medium">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => closeRef.current()}
            className={cn(
              '-mt-1 -mr-1 rounded-md px-2 py-1 text-small opacity-50 transition duration-fast ease-standard hover:opacity-80',
              focusRing,
            )}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-body">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
