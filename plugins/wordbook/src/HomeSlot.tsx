import type { PluginSlotProps, WordbookEntry } from '@gofor/plugin-api';
import { useEffect, useState } from 'react';

/**
 * 首页统计区后面的"单词库"小卡。
 *
 * 它属于单词库插件：插件被禁用时整块消失（而不是显示 0 个词）。
 * 数据通过 `host.data` 走契约读取，不直接碰 IndexedDB。
 */
export function WordbookHomeSlot({ host }: PluginSlotProps) {
  const [entries, setEntries] = useState<WordbookEntry[] | null>(null);

  useEffect(() => {
    return host.data.watch<WordbookEntry[]>('wordbook.entries', {}, (next) => {
      setEntries(next);
    });
  }, [host]);

  return (
    <section
      data-plugin-surface="gofor.wordbook"
      className="rounded-xl border border-line bg-card-faint px-4 py-3"
      aria-label="单词库"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm">📚 单词库</span>
          <span className="text-small tabular-nums opacity-60">
            {entries === null ? '读取中…' : `${entries.length} 个词`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => host.navigate('gofor.wordbook/screen')}
          className="rounded-md border border-line px-2 py-1 text-caption opacity-60 transition-opacity duration-fast hover:opacity-100"
        >
          打开
        </button>
      </div>
      <p className="mt-1 text-micro leading-relaxed opacity-35">
        插件提供 · 导入 CSV/TSV 即可；数据会随备份一起导出
      </p>
    </section>
  );
}
