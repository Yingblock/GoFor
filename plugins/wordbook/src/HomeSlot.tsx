import type { HomeBlockProps, WordbookEntry } from '@gofor/plugin-api';
import { useEffect, useState } from 'react';

/** 首页「单词库」内容块；数据通过 `host.data` 契约读取。 */
export function WordbookHomeBlock({ host }: HomeBlockProps) {
  const [entries, setEntries] = useState<WordbookEntry[] | null>(null);

  useEffect(() => {
    return host.data.watch<WordbookEntry[]>('wordbook.entries', {}, (next) => {
      setEntries(next);
    });
  }, [host]);

  return (
    <div data-plugin-surface="gofor.wordbook" aria-label="单词库">
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
    </div>
  );
}
