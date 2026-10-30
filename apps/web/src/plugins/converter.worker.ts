/// <reference lib="webworker" />

/**
 * 宿主内置的转换 Worker（P3-3.8）。
 *
 * 任务按 id 分派，**不 eval 插件代码**：运行时插件给不出可信的 Worker 任务，
 * 只能声明 `needsDesktopBridge` 或使用宿主提供的任务。
 * 死循环会把任务拖到超时，由主线程 terminate 掉，不会冻结页面。
 */

export interface ConverterWorkerRequest {
  jobId: string;
  workerId: string;
  text: string;
}

export interface ConverterWorkerResponse {
  jobId: string;
  type: 'done' | 'error';
  text?: string;
  message?: string;
}

const context = self as unknown as DedicatedWorkerGlobalScope;

function stripMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

context.onmessage = (event: MessageEvent<ConverterWorkerRequest>) => {
  const { jobId, workerId, text } = event.data;
  try {
    if (workerId === 'markdown-to-text') {
      context.postMessage({ jobId, type: 'done', text: stripMarkdown(text) });
      return;
    }
    context.postMessage({
      jobId,
      type: 'error',
      message: `宿主 Worker 不支持任务 ${workerId}`,
    });
  } catch (error) {
    context.postMessage({
      jobId,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
