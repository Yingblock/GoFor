import { dateKey, type ScanBatch, type ScanResult } from '@gofor/core/domain';
import { applyScanResults, db, updateScanBatchStatus } from '@gofor/store';
import { useMemo, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../../clock.ts';

export interface ScanReviewProps {
  batch: ScanBatch;
  /** 应用/丢弃后回调，让上层刷新列表。 */
  onSettled: () => void;
}

const KIND_LABEL: Record<ScanResult['kind'], string> = {
  checkbox: '勾选',
  cell: '格子',
  slider: '三格',
};

/**
 * 回填待确认列表（P2-2.5）。
 *
 * 设计原则：**识别结果永远不当成事实**。默认全选（识别为已勾的），
 * 但用户能逐条取消；点「应用」才真正写库。应用完留下 `applied` 记录，
 * 事后能查"这次扫描到底改了什么"。
 *
 * 为什么不用"自动应用 + 撤销"：撤销要维护反向补丁，且用户不一定回来看；
 * 一次确认的成本很低，错写的成本很高。
 */
export function ScanReview({ batch, onSettled }: ScanReviewProps) {
  /** 只存"用户取消掉的" targetId，默认全选，避免每扫一次都点一堆。 */
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => batch.results.filter((result) => result.selected),
    [batch.results],
  );

  const include = useMemo(
    () => selected.filter((result) => !excluded.has(result.targetId)),
    [selected, excluded],
  );

  const toggle = (targetId: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  };

  const apply = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const now = appClock.now();
      const summary = await applyScanResults(db, include, batch.date, now);
      await updateScanBatchStatus(db, batch.id, 'applied', now);
      const parts = [
        summary.tasksDone > 0 ? `${summary.tasksDone} 个作业` : null,
        summary.habitsChecked > 0 ? `${summary.habitsChecked} 项打卡` : null,
        summary.moodSaved ? '三格自评' : null,
      ].filter((item): item is string => item !== null);
      setMessage(
        `已回填 ${parts.length > 0 ? parts.join('、') : '0 项'}` +
          (summary.skipped > 0 ? `，${summary.skipped} 项对不上已跳过` : ''),
      );
      onSettled();
    } catch (error) {
      setMessage(`回填失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await updateScanBatchStatus(db, batch.id, 'discarded', appClock.now());
      onSettled();
    } finally {
      setBusy(false);
    }
  };

  if (selected.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-black/[0.08] bg-white/50 px-4 py-4 text-xs">
        <p className="opacity-60">这张纸没有识别到已填的格子。</p>
        <p className="opacity-40">
          可能是：纸没摆正、光太暗、或者这一页确实还没写。手动补记录也可以。
        </p>
        <button
          type="button"
          onClick={() => void discard()}
          disabled={busy}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
        >
          丢弃这次扫描
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        识别只是猜测，确认过再应用。日期：{batch.date}（来自纸上的二维码）
      </div>

      <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
        {selected.map((result) => {
          const checked = !excluded.has(result.targetId);
          return (
            <li key={result.targetId} className="flex items-center gap-3 px-4 py-2 text-sm">
              <input
                type="checkbox"
                aria-label={`回填 ${result.label}`}
                checked={checked}
                onChange={() => toggle(result.targetId)}
                className="size-4 shrink-0"
              />
              <span className="flex-1">{result.label}</span>
              <span className="text-[10px] opacity-35">
                {KIND_LABEL[result.kind]}
                {result.value !== undefined ? ` · ${result.value}` : ''}
              </span>
              <span className="w-12 text-right text-[10px] tabular-nums opacity-30">
                {(result.ink * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || include.length === 0}
          className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white disabled:opacity-50"
        >
          {busy ? '正在回填…' : `应用这 ${include.length} 项`}
        </button>
        <button
          type="button"
          onClick={() => void discard()}
          disabled={busy}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
        >
          整张丢弃
        </button>
        <span className="text-[11px] opacity-40">
          已完成 {dateKey(appClock)} 的记录不受影响，只写今天/这张纸上的日期
        </span>
      </div>

      {message === null ? null : (
        <p className="rounded-lg bg-black/[0.05] px-3 py-2 text-xs opacity-70">{message}</p>
      )}
    </div>
  );
}
