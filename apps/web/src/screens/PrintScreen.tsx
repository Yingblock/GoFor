import type { Task } from '@gofor/core/domain';
import type { PaperId } from '@gofor/core/print';
import { type Block, layout, PAPER_SIZES } from '@gofor/core/print';
import { PrintPreview } from '../print/PrintSheet.tsx';

export interface PrintScreenProps {
  blocks: Block[];
  paper: PaperId;
  tasks: Task[];
  onChangePaper: (paper: PaperId) => void;
}

/** P1·M3 导出：打印 checklist。 */
export function PrintScreen({ blocks, paper, tasks, onChangePaper }: PrintScreenProps) {
  const pageCount = layout(blocks, { paper }).pages.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
        >
          打印这一张
        </button>
        {(['A4', 'A5'] as const).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChangePaper(size)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              paper === size
                ? 'border-[var(--color-ink)] font-medium'
                : 'border-black/10 opacity-60'
            }`}
          >
            {PAPER_SIZES[size].name}
          </button>
        ))}
        <span className={`text-xs ${pageCount > 1 ? 'text-amber-600' : 'opacity-40'}`}>
          共 {pageCount} 页{pageCount > 1 ? '（超出，换 A4 或减少行数）' : ''}
        </span>
      </div>

      <PrintPreview blocks={blocks} paper={paper} data={{ tasks }} />

      <p className="text-[11px] leading-relaxed opacity-40">
        打印前请确认：缩放 100% · 关闭页眉页脚 · 勾选「背景图形」。
        每台打印机第一次使用前，先打一张校准页确认边距。
      </p>
    </div>
  );
}
