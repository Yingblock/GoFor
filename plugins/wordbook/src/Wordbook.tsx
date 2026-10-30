import type { PluginScreenProps, WordbookEntry } from '@gofor/plugin-api';
import { Button, Card, Chip, EmptyState, Input, Textarea } from '@gofor/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filterWordbookEntries, mergeWordbookEntries, parseWordbook } from './wordbook.ts';
import { readWordbookEntries, WORDBOOK_COLLECTION } from './wordbookStore.ts';

/**
 * 单词库 v1（P3-3.7 / P4-4.16）。
 *
 * 只做「导入 CSV/TSV → 存 → 查 → 标签」，**不做复习**（SRS 在 P4-4.8）。
 * 数据全部走插件自己的 `host.storage`（Dexie 的 pluginData 容器），
 * 所以它既是内容模块插件的参考实现，也是"插件数据进备份"的活样本。
 */
export function WordbookScreen({ host }: PluginScreenProps) {
  const [entries, setEntries] = useState<WordbookEntry[] | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setEntries(await readWordbookEntries(host.storage));
  }, [host.storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const all = entries ?? [];
  const tags = useMemo(
    () => [...new Set(all.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b)),
    [all],
  );
  const visible = useMemo(
    () =>
      filterWordbookEntries(all, {
        ...(query === '' ? {} : { query }),
        ...(tag === null ? {} : { tag }),
      }),
    [all, query, tag],
  );

  const importText = async (source: string) => {
    const parsed = parseWordbook(source);
    if (parsed.rows.length === 0) {
      setNotice('没有解析出任何词条：至少要有「单词」一列（CSV/TSV）');
      return;
    }
    setBusy(true);
    try {
      const merged = mergeWordbookEntries(all, parsed.rows, {
        now: host.now(),
        newId: host.newId,
      });
      // 只写变化的行：全量重写会让 updatedAt 全部跳变，revision 也跟着乱。
      const existing = new Map(all.map((entry) => [entry.id, entry]));
      for (const entry of merged.entries) {
        const previous = existing.get(entry.id);
        if (
          previous !== undefined &&
          previous.updatedAt === entry.updatedAt &&
          previous.meaning === entry.meaning &&
          previous.tags.join() === entry.tags.join()
        ) {
          continue;
        }
        await host.storage.put(WORDBOOK_COLLECTION, entry.id, entry);
      }
      await reload();
      setText('');
      const skipped = parsed.skipped > 0 ? `，跳过 ${parsed.skipped} 行` : '';
      const header = parsed.headerDetected ? '（已识别表头）' : '';
      setNotice(
        `导入 ${parsed.rows.length} 行：新增 ${merged.added}，更新 ${merged.updated}${skipped}${header}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: WordbookEntry) => {
    await host.storage.delete(WORDBOOK_COLLECTION, entry.id);
    await reload();
    setNotice(`已删除「${entry.term}」`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium opacity-60">单词库</h2>
          <p className="mt-1 text-caption opacity-35">
            插件「gofor.wordbook」 · 只做存/查/标签，不做复习（SRS 属 P4）
          </p>
        </div>
        <span className="text-small tabular-nums opacity-50" data-e2e="wordbook-count">
          {entries === null ? '读取中…' : `${all.length} 个词`}
        </span>
      </header>

      <Card padding="none" className="space-y-3 px-4 py-3">
        <h3 className="text-section font-medium">导入</h3>
        <p className="text-caption leading-relaxed opacity-40">
          支持 CSV / TSV：第一列单词、第二列释义（可空）、第三列标签（用 ; | , 分隔）。
          带表头会自动跳过；重复的词会合并标签。
        </p>
        <Textarea
          aria-label="粘贴词表"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={'单词,释义,标签\napple,苹果,水果\nrun,跑'}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || text.trim() === ''}
            onClick={() => void importText(text)}
          >
            {busy ? '导入中…' : '导入粘贴内容'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            选择 CSV/TSV 文件
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            aria-label="选择词表文件"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              await importText(await file.text());
            }}
          />
        </div>
        {notice ? (
          <p className="text-caption leading-relaxed opacity-55" role="status">
            {notice}
          </p>
        ) : null}
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="搜索单词"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜词或释义…"
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1">
            <Chip active={tag === null} onClick={() => setTag(null)}>
              全部
            </Chip>
            {tags.map((entryTag) => (
              <Chip
                key={entryTag}
                active={tag === entryTag}
                onClick={() => setTag(tag === entryTag ? null : entryTag)}
              >
                {entryTag}
              </Chip>
            ))}
          </div>
        </div>

        {entries !== null && all.length === 0 ? (
          <EmptyState
            title="词库还是空的"
            description="导入一份 CSV/TSV，或者直接在上面粘贴两行试试。"
            size="sm"
          />
        ) : visible.length === 0 && all.length > 0 ? (
          <EmptyState title="没有匹配的词" description="换个关键词或清掉标签筛选。" size="sm" />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card-faint">
            {visible.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-body font-medium">{entry.term}</span>
                    {entry.tags.map((entryTag) => (
                      <span key={entryTag} className="text-micro opacity-35">
                        #{entryTag}
                      </span>
                    ))}
                  </div>
                  <p className="text-small break-words opacity-55">
                    {entry.meaning === '' ? '（还没有释义）' : entry.meaning}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`删除 ${entry.term}`}
                  onClick={() => void remove(entry)}
                  className="shrink-0 opacity-40 hover:opacity-80"
                >
                  删除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-micro leading-relaxed opacity-30">
        数据存在本机 pluginData 容器里，导出备份时会一起带走；卸载插件默认保留数据。
      </p>
    </div>
  );
}
