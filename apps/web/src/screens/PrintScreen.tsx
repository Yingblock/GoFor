import type { Task } from '@gofor/core/domain';
import { type Block, layout, PAPER_IDS, PAPER_SIZES, type PaperId } from '@gofor/core/print';
import { PrintPreview } from '../print/PrintSheet.tsx';

export interface PrintScreenProps {
  blocks: Block[];
  paper: PaperId;
  tasks: Task[];
  /** 当日课表，已排序；没有课就是空数组。 */
  schedule: { time: string; label: string }[];
  onChangePaper: (paper: PaperId) => void;
}

/** 离线·M3 导出：打印 checklist。 */
export function PrintScreen({ blocks, paper, tasks, schedule, onChangePaper }: PrintScreenProps) {
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
        {/* 纸张列表直接来自 core 的 PAPER_IDS：新增尺寸只改一处，这里不会再漏。 */}
        {PAPER_IDS.map((size) => (
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
          共 {pageCount} 页{pageCount > 1 ? '（超出，换更大的纸或减少行数）' : ''}
        </span>
      </div>

      <PrintPreview blocks={blocks} paper={paper} data={{ tasks, schedule }} />

      <p className="text-[11px] leading-relaxed opacity-40">
        打印前请确认：缩放 100% · 关闭页眉页脚 · 勾选「背景图形」。
        每台打印机第一次使用前，先打一张校准页确认边距。
      </p>
    </div>
  );
}
