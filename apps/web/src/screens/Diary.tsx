import { newId } from '@gofor/core';
import { type DiaryEntry, dateKey } from '@gofor/core/domain';
import { addDays } from '@gofor/core/stats';
import { db, deleteDiaryEntry, listDiaryEntries, saveDiaryEntry } from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { appClock } from '../clock.ts';

/** 列表只回看 30 天：再早的日记不删，只是不挤在这里。 */
const RECENT_DAYS = 30;

const MOOD_VALUES = [1, 2, 3, 4, 5] as const;

const chipOn = 'rounded-full bg-[var(--color-ink)] px-2.5 py-1 text-[11px] text-white';
const chipOff = 'rounded-full border border-black/10 bg-white/60 px-2.5 py-1 text-[11px]';

/**
 * 情绪日记。
 *
 * 同一天可以写多条（`createdAt` 区分先后），列表按日期倒序。
 * 标签同时提供「从已有标签点选」和「新输入」两条路：只让输入会逼用户记拼写，
 * 只让点选又没法加新标签。
 */
export function DiaryScreen() {
  const today = dateKey(appClock);
  const from = useMemo(() => addDays(today, -(RECENT_DAYS - 1)), [today]);

  const entries = useLiveQuery(
    () => listDiaryEntries(db, from, today),
    [from, today],
    [] as DiaryEntry[],
  );

  const [text, setText] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /** 已有标签 = 最近 30 天日记里出现过的标签，去重后排序。 */
  const knownTags = useMemo(() => {
    const pool = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) pool.add(tag);
    }
    return [...pool].sort((left, right) => left.localeCompare(right, 'zh'));
  }, [entries]);

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '');
    setTagDraft('');
    if (tag === '' || tags.includes(tag)) return;
    setTags((current) => [...current, tag]);
    setSaved(false);
  };

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((item) => item !== tag));
    setSaved(false);
  };

  const onSave = async () => {
    const trimmed = text.trim();
    if (trimmed === '') return;

    // 输入框里还没回车的标签也要一起存，否则「写完标签直接点保存」会丢标签。
    const pendingTag = tagDraft.trim().replace(/^#/, '');
    const finalTags =
      pendingTag !== '' && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    setSaving(true);
    setError(null);
    try {
      await saveDiaryEntry(db, {
        id: newId(),
        date: today,
        text: trimmed,
        tags: finalTags,
        mood,
        createdAt: appClock.now(),
      });
      setText('');
      setMood(null);
      setTags([]);
      setTagDraft('');
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteDiaryEntry(db, id);
      setPendingDeleteId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-3 rounded-xl border border-black/[0.08] bg-white/50 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">写今天的</h2>
          <span className="text-[11px] opacity-35">{today}</span>
        </div>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
          rows={4}
          placeholder="今天发生了什么？怎么想的？不用写长。"
          aria-label="今天的日记"
          className="w-full resize-y rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm leading-relaxed outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] opacity-40">心情</span>
          {MOOD_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mood === value}
              aria-label={`心情 ${value}`}
              onClick={() => {
                setMood(mood === value ? null : value);
                setSaved(false);
              }}
              className={mood === value ? chipOn : chipOff}
            >
              {value}
            </button>
          ))}
          <span className="text-[10px] opacity-30">再点一次取消</span>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] opacity-40">标签</span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`移除标签 ${tag}`}
                className={chipOn}
              >
                #{tag} ×
              </button>
            ))}
            {tags.length === 0 ? <span className="text-[10px] opacity-30">还没选</span> : null}
          </div>

          {knownTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {knownTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className={`${chipOff} opacity-60 transition hover:opacity-100`}
                  >
                    #{tag}
                  </button>
                ))}
            </div>
          ) : (
            <p className="text-[10px] opacity-30">还没有用过的标签，在下面输入第一个。</p>
          )}

          <div className="flex items-center gap-2">
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                  event.preventDefault();
                  addTag(tagDraft);
                }
              }}
              placeholder="新标签，回车添加"
              aria-label="新标签"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => addTag(tagDraft)}
              disabled={tagDraft.trim() === ''}
              className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] opacity-70 transition disabled:opacity-30"
            >
              添加
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || text.trim() === ''}
            className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white transition disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          {saved ? <span className="text-[11px] opacity-50">✓ 已保存</span> : null}
          {error ? (
            <span className="text-[11px] text-red-600/70" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">最近 {RECENT_DAYS} 天</h2>
          <span className="text-[11px] opacity-35">{entries.length} 条</span>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-black/[0.08] bg-white/50 px-4 py-8 text-center text-[11px] opacity-35">
            最近 {RECENT_DAYS} 天还没有日记。
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-black/[0.08] bg-white/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] tabular-nums opacity-50">{entry.date}</span>
                    {entry.mood !== null ? (
                      <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] opacity-60">
                        心情 {entry.mood}
                      </span>
                    ) : null}
                    {entry.date === today ? (
                      <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] opacity-60">
                        今天
                      </span>
                    ) : null}
                  </div>

                  {pendingDeleteId === entry.id ? (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => void onDelete(entry.id)}
                        className="rounded-lg bg-red-600/80 px-2.5 py-1 text-white"
                      >
                        确认删除？
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="opacity-40 transition hover:opacity-70"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(entry.id)}
                      className="text-[11px] opacity-35 transition hover:opacity-60"
                    >
                      删除
                    </button>
                  )}
                </div>

                <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed">
                  {entry.text}
                </p>

                {entry.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] opacity-50"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
