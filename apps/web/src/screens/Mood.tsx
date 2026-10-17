import { dateKey, type MoodLog } from '@gofor/core/domain';
import { addDays } from '@gofor/core/stats';
import { db, getMoodLog, listMoodLogs, saveMoodLog } from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appClock } from '../clock.ts';

/** 最近 14 天（含今天）。 */
const RECENT_DAYS = 14;

const MOOD_FIELDS = [
  { key: 'sleep', label: '睡眠' },
  { key: 'mood', label: '心情' },
  { key: 'focus', label: '专注' },
] as const;

type MoodField = (typeof MOOD_FIELDS)[number]['key'];
type MoodValues = Record<MoodField, number>;

const DEFAULT_VALUES: MoodValues = { sleep: 3, mood: 3, focus: 3 };

interface MoodSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** 一根 1–5 的滑块 + 数字显示。数字必须可见：滑块位置不够精确，也不方便回看。 */
function MoodSlider({ label, value, onChange }: MoodSliderProps) {
  return (
    <label className="block rounded-xl border border-black/[0.08] bg-white/50 px-4 py-3">
      <span className="flex items-baseline justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-[var(--color-ink)]"
      />
      <span className="flex justify-between text-[10px] opacity-35">
        <span>1 · 很差</span>
        <span>5 · 很好</span>
      </span>
    </label>
  );
}

/**
 * 睡眠 / 心情 / 专注三滑块。
 *
 * 一天一条：`moodLogs` 的主键就是日期，重存覆盖今天，不会长成时间序列。
 * 读走 `liveQuery`（只读），写只在事件处理器里做——`liveQuery` 里写会抛
 * `ReadOnlyError` 白屏（见 AGENTS「存储约定」）。
 */
export function MoodScreen() {
  const today = dateKey(appClock);

  const log = useLiveQuery(() => getMoodLog(db, today), [today], undefined);
  const [values, setValues] = useState<MoodValues>(DEFAULT_VALUES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 用户动过滑块之后，异步加载回来的「今天已有记录」不再覆盖草稿。
   * 否则网速慢/IndexedDB 稍慢时，刚拖好的值会被旧值弹回去。
   */
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (log === undefined || dirtyRef.current) return;
    setValues({ sleep: log.sleep, mood: log.mood, focus: log.focus });
  }, [log]);

  const update = (field: MoodField, value: number) => {
    dirtyRef.current = true;
    setSaved(false);
    setError(null);
    setValues((current) => ({ ...current, [field]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMoodLog(db, { date: today, ...values }, appClock.now());
      dirtyRef.current = false;
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const from = useMemo(() => addDays(today, -(RECENT_DAYS - 1)), [today]);
  const logs = useLiveQuery(() => listMoodLogs(db, from, today), [from, today], [] as MoodLog[]);
  const byDate = useMemo(() => new Map(logs.map((entry) => [entry.date, entry])), [logs]);
  const recentDates = useMemo(
    () => Array.from({ length: RECENT_DAYS }, (_, index) => addDays(today, -index)),
    [today],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">今天的三格</h2>
          <span className="text-[11px] opacity-35">一天一条 · 重存会覆盖今天</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {MOOD_FIELDS.map((field) => (
            <MoodSlider
              key={field.key}
              label={field.label}
              value={values[field.key]}
              onChange={(value) => update(field.key, value)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white transition disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存今天'}
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
          <span className="text-[11px] opacity-35">睡眠 / 心情 / 专注</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-left text-[11px] opacity-40">
                <th className="px-4 py-2 font-normal">日期</th>
                <th className="px-3 py-2 font-normal">睡眠</th>
                <th className="px-3 py-2 font-normal">心情</th>
                <th className="px-3 py-2 font-normal">专注</th>
              </tr>
            </thead>
            <tbody>
              {recentDates.map((date, index) => {
                const entry = byDate.get(date);
                return (
                  <tr key={date} className="border-b border-black/[0.04] last:border-b-0">
                    <td className="px-4 py-2 tabular-nums opacity-60">
                      {date}
                      {index === 0 ? (
                        <span className="ml-2 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] opacity-60">
                          今天
                        </span>
                      ) : null}
                    </td>
                    {entry ? (
                      <>
                        <td className="px-3 py-2 tabular-nums">{entry.sleep}</td>
                        <td className="px-3 py-2 tabular-nums">{entry.mood}</td>
                        <td className="px-3 py-2 tabular-nums">{entry.focus}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-[11px] opacity-30">
                        没记录 — / — / —
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
