import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出错时显示的位置说明，例如「这个页面」「设置」 */
  title?: string;
  /** 这个值变化时自动清除错误状态（切页面后不要一直卡在错误页） */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 渲染错误的最后一道防线。
 *
 * 为什么要有这个：Dexie `liveQuery` 里误写数据会抛 `ReadOnlyError`，没有边界时
 * 整棵树被卸载 → 白屏，用户只能清缓存。边界至少能说清「哪块坏了」，并给出重试/刷新。
 * 它兜不住事件处理器和异步回调里的错误（React 本来就抓不到），那些要在源头处理。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    // `throw` 出来的不一定是 Error（可能是字符串），统一成 Error 才能稳定显示 message。
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 带上下文，排障时至少能看出是哪块 UI 崩的。
    console.error(`[ErrorBoundary]「${this.props.title ?? '这块内容'}」渲染出错`, error, {
      componentStack: info.componentStack,
    });
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    // resetKey 变化（切页面）时解除错误，避免用户被困在错误页。
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  private readonly reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="rounded-xl border border-black/[0.08] bg-white/60 px-4 py-6" role="alert">
        <h2 className="text-lg font-medium">{this.props.title ?? '这块内容出错了'}</h2>
        <p className="mt-1 text-sm leading-relaxed opacity-50">数据还在本机，刷新通常能恢复</p>
        <p className="mt-3 break-words font-mono text-[11px] leading-relaxed opacity-40">
          {error.message}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={this.retry}
            className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs opacity-70 hover:opacity-100"
          >
            重试
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs opacity-50 hover:opacity-80"
          >
            重新加载页面
          </button>
        </div>
      </div>
    );
  }
}

export interface ScreenBoundaryProps {
  children: ReactNode;
  /** 当前页面标识；切页面时变化，错误状态随之清除。 */
  resetKey?: unknown;
}

/** 外壳按页面包一层：一页崩了只显示错误卡片，不连累导航和打印层。 */
export function ScreenBoundary({ children, resetKey }: ScreenBoundaryProps) {
  return (
    <ErrorBoundary title="这个页面出错了" resetKey={resetKey}>
      {children}
    </ErrorBoundary>
  );
}
