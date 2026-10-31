import { dateKey, type ScanBatch, type ScanResult } from '@gofor/core/domain';
import type { ScanDispatchSummary } from '@gofor/plugin-api';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '@gofor/plugin-kit';
import type { PluginStoreApi } from '@gofor/plugin-kit/store';
import { Button, Card, Checkbox, EmptyState } from '@gofor/ui';
import { useMemo, useState } from 'react';

export interface ScanReviewProps {
  batch: ScanBatch;
  store: PluginStoreApi;
  /** 应用/丢弃后回调，让上层刷新列表。 */
  onSettled: () => void;
  /** 宿主注入：按结果 owner 分发给各插件处理。 */
  applyScan: (results: readonly ScanResult[], date: string) => Promise<ScanDispatchSummary>;
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
export function ScanReview({ batch, onSettled, applyScan, store }: ScanReviewProps) {
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
      // P3.5：识别结果按 owner 交给对应插件处理；core 不再硬编码 task/habit/mood。
      const summary = await applyScan(include, batch.date);
      const missing = summary.missing.map(
        (item) => `缺失「${item.name}」插件，${item.count} 项未回填`,
      );
      // 缺插件/处理器出错时不标 applied：重新启用后还能再点一次。
      if (missing.length === 0 && summary.errors.length === 0) {
        await store.updateScanBatchStatus(batch.id, 'applied', now);
      }
      const parts = summary.parts.map((part) => `${part.handled} 项${part.name}`);
      const notices = [
        ...missing,
        ...summary.errors.map((error) => `处理失败：${error}`),
        summary.skipped > 0 ? `${summary.skipped} 项对不上已跳过` : null,
      ].filter((item): item is string => item !== null);
      setMessage(
        `已回填 ${parts.length > 0 ? parts.join('、') : '0 项'}` +
          (notices.length > 0 ? `；${notices.join('；')}` : ''),
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
      await store.updateScanBatchStatus(batch.id, 'discarded', appClock.now());
      onSettled();
    } finally {
      setBusy(false);
    }
  };

  if (selected.length === 0) {
    return (
      <EmptyState
        title="这张纸没有识别到已填的格子。"
        description="可能是：纸没摆正、光太暗、或者这一页确实还没写。手动补记录也可以。"
        action={
          <Button variant="secondary" onClick={() => void discard()} disabled={busy}>
            丢弃这次扫描
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-caption text-warn">
        识别只是猜测，确认过再应用。日期：{batch.date}（来自纸上的
        {batch.source === 'barcode' ? '页尾条码' : '二维码'}）
      </div>

      {batch.manifestSource === 'rebuilt' ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-caption text-danger">
          这份坐标是按<strong>当前模板</strong>
          重建的，不是打印时固化下来的。如果纸上行数或顺序和现在不同，
          下面的勾选可能对到别的行——请逐条核对后再应用。
        </div>
      ) : null}

      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-line">
          {selected.map((result) => {
            const checked = !excluded.has(result.targetId);
            return (
              <li key={result.targetId} className="flex items-center gap-3 px-4 py-2 text-body">
                <Checkbox
                  aria-label={`回填 ${result.label}`}
                  checked={checked}
                  onChange={() => toggle(result.targetId)}
                />
                <span className="flex-1">{result.label}</span>
                <span className="text-micro opacity-35">
                  {KIND_LABEL[result.kind]}
                  {result.value !== undefined ? ` · ${result.value}` : ''}
                </span>
                <span className="w-12 text-right text-micro tabular-nums opacity-30">
                  {(result.ink * 100).toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={() => void apply()}
          disabled={busy || include.length === 0}
        >
          {busy ? '正在回填…' : `应用这 ${include.length} 项`}
        </Button>
        <Button variant="secondary" onClick={() => void discard()} disabled={busy}>
          整张丢弃
        </Button>
        <span className="text-caption opacity-40">
          已完成 {dateKey(appClock)} 的记录不受影响，只写今天/这张纸上的日期
        </span>
      </div>

      {message === null ? null : (
        <p className="rounded-md bg-ink/[0.05] px-3 py-2 text-small opacity-70">{message}</p>
      )}
    </div>
  );
}
