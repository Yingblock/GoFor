import type { Task } from '@gofor/core/domain';
import { type Block, layout, PAPER_IDS, PAPER_SIZES, type PaperId } from '@gofor/core/print';
import { buildSheetManifest } from '@gofor/core/scan';
import { db, saveSheetManifest, sheetManifestId } from '@gofor/store';
import { useEffect, useMemo, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import {
  PrintPreview,
  PrintPreviewDialog,
  type PrintPreviewDialogProps,
  type SheetData,
} from '../print/PrintSheet.tsx';
import type { PrintTemplateChoice } from '../print/template.ts';

export interface PrintScreenProps {
  blocks: Block[];
  paper: PaperId;
  tasks: Task[];
  /** 与 `PrintLayer` 完全相同的数据对象：预览 / 打印必须是同一份内容。 */
  data: SheetData;
  /** 当前模板 id：二维码里要写它，扫描时靠它找回坐标清单。 */
  templateId: string;
  /** 当前模板名（下拉与预览标题用）。 */
  templateName: string;
  /** 可选模板：内置（含校准页）+ 用户模板，由 App 从 core / Dexie 汇总。 */
  templates: PrintTemplateChoice[];
  /** 这张纸的日期（`YYYY-MM-DD`）。 */
  date: string;
  onChangePaper: (paper: PaperId) => void;
  onChangeTemplate: (templateId: string) => void;
}

/** 离线·M3 导出：打印 checklist。 */
export function PrintScreen({
  blocks,
  paper,
  tasks,
  data,
  templateId,
  templateName,
  templates,
  date,
  onChangePaper,
  onChangeTemplate,
}: PrintScreenProps) {
  const pageCount = layout(blocks, { paper }).pages.length;
  const [previewOpen, setPreviewOpen] = useState(false);

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
      bindings: {
        'tasks.today': tasks.map((task) => task.id),
        'habits.today': (data.habits ?? []).map((habit) => habit.id),
      },
      labels: {
        'tasks.today': tasks.map((task) => task.title),
        'habits.today': (data.habits ?? []).map((habit) => habit.name),
      },
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
  }, [templateId, date, paper, blocks, tasks, data.habits]);

  // 下拉里必须能选中当前值：模板被删/坏数据回退时，至少还有「我的一天」兜底。
  const options = useMemo(() => {
    if (templates.some((template) => template.id === templateId)) return templates;
    return [
      ...templates,
      { id: templateId, name: `${templateName}（已失效，回退「我的一天」）`, custom: false },
    ];
  }, [templateId, templateName, templates]);

  const dialogProps: PrintPreviewDialogProps = {
    blocks,
    paper,
    data,
    templateName,
    onClose: () => setPreviewOpen(false),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          应用内预览是主入口：先在屏幕上看清这张纸（与真实打印同一套 blocks/paper/data），
          再进系统打印框。直接打印仍然保留，给熟悉 Ctrl/⌘+P 的人。
        */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="rounded-lg bg-strong px-4 py-2 text-sm text-on-strong"
        >
          打印预览
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-line px-3 py-1.5 text-xs opacity-70"
        >
          打印这一张
        </button>

        <label className="ml-1 flex items-center gap-1.5 text-xs">
          <span className="opacity-50">模板</span>
          <select
            aria-label="打印模板"
            value={templateId}
            onChange={(event) => onChangeTemplate(event.target.value)}
            className="max-w-44 rounded-lg border border-line bg-card-soft px-2 py-1.5 text-xs"
          >
            {options.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.custom && !template.name.endsWith('（我的）') ? '（我的）' : ''}
              </option>
            ))}
          </select>
        </label>

        {/* 纸张列表直接来自 core 的 PAPER_IDS：新增尺寸只改一处，这里不会再漏。 */}
        {PAPER_IDS.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChangePaper(size)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              paper === size ? 'border-[var(--color-strong)] font-medium' : 'border-line opacity-60'
            }`}
          >
            {PAPER_SIZES[size].name}
          </button>
        ))}
        <span className={`text-xs ${pageCount > 1 ? 'text-amber-600' : 'opacity-40'}`}>
          共 {pageCount} 页{pageCount > 1 ? '（超出，换更大的纸或减少行数）' : ''}
        </span>
      </div>

      <PrintPreview blocks={blocks} paper={paper} data={data} />

      <p className="text-caption leading-relaxed opacity-40">
        打印前请确认：缩放 100% · 关闭页眉页脚 · 勾选「背景图形」。
        右上角的二维码是这张纸的身份证——扫回来时靠它认日期与坐标，别裁掉。
        每台打印机第一次使用前，先打一张校准页确认边距。
      </p>

      {/*
        模态在 `.screen-only` 内部：打印时连同它一起隐藏，真正进纸的只有 `.print-root`。
        但两者用的是同一份 blocks / paper / data，所以预览即所得。
      */}
      {previewOpen ? <PrintPreviewDialog {...dialogProps} /> : null}
    </div>
  );
}
