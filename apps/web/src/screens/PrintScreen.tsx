import type { Task } from '@gofor/core/domain';
import { type Block, layout, PAPER_IDS, PAPER_SIZES, type PaperId } from '@gofor/core/print';
import { buildSheetManifest } from '@gofor/core/scan';
import { db, saveSheetManifest, sheetManifestId } from '@gofor/store';
import { useEffect } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import { PrintPreview } from '../print/PrintSheet.tsx';

export interface PrintScreenProps {
  blocks: Block[];
  paper: PaperId;
  tasks: Task[];
  /** 当日课表，已排序；没有课就是空数组。 */
  schedule: { time: string; label: string }[];
  /** 当前模板 id：二维码里要写它，扫描时靠它找回坐标清单。 */
  templateId: string;
  /** 这张纸的日期（`YYYY-MM-DD`）。 */
  date: string;
  onChangePaper: (paper: PaperId) => void;
}

/** 离线·M3 导出：打印 checklist。 */
export function PrintScreen({
  blocks,
  paper,
  tasks,
  schedule,
  templateId,
  date,
  onChangePaper,
}: PrintScreenProps) {
  const pageCount = layout(blocks, { paper }).pages.length;
  const qr = { templateId, date, paper };

  /**
   * 进入打印页、或换了纸张/模板/任务后就固化坐标清单。
   *
   * 为什么不绑在「打印这一张」按钮上：用户经常直接按 Ctrl/⌘+P，那条路不会经过我们的
   * 点击处理，清单就会缺失，扫回来只会得到「没有坐标记录」。清单描述的是"这张纸长什么样"，
   * 进入打印页时就已经确定了；打印只是把它落到纸上。
   *
   * 存清单失败不阻塞打印：纸还是要能打出来，只是这次扫回来会提示没有坐标。
   */
  useEffect(() => {
    const manifest = buildSheetManifest({
      templateId,
      date,
      paper,
      blocks,
      bindings: { 'tasks.today': tasks.map((task) => task.id) },
      labels: { 'tasks.today': tasks.map((task) => task.title) },
    });
    void saveSheetManifest(db, {
      id: sheetManifestId(templateId, date, paper),
      templateId,
      date,
      paper,
      json: JSON.stringify(manifest),
      createdAt: appClock.now(),
    }).catch((error: unknown) => {
      console.warn('坐标清单没存下来，这次扫描将无法回填', error);
    });
  }, [templateId, date, paper, blocks, tasks]);

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

      <PrintPreview blocks={blocks} paper={paper} data={{ tasks, schedule, qr }} />

      <p className="text-[11px] leading-relaxed opacity-40">
        打印前请确认：缩放 100% · 关闭页眉页脚 · 勾选「背景图形」。
        右上角的二维码是这张纸的身份证——扫回来时靠它认日期与坐标，别裁掉。
        每台打印机第一次使用前，先打一张校准页确认边距。
      </p>
    </div>
  );
}
