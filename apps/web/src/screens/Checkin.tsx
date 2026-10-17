import { systemClock } from '@gofor/core';
import { type Checkin, dateKey, type StudySession } from '@gofor/core/domain';
import { db, setCheckin } from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';

const WINDOW_DAYS = 14;

/** 'YYYY-MM-DD' 加减天数（UTC 换算，避开时区偏移）。 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** 从 endDate 往回数连续有活动的天数。 */
function streakOf(activeDates: Set<string>, endDate: string): number {
  let count = 0;
  let cursor = endDate;
  while (activeDates.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * P1·M2 每日打卡。
 *
 * 只记"这一天有没有学"。连续天数是**算出来的**，不落库——
 * 存下来的计数在补录历史时一定不一致。
 */
export function CheckinScreen() {
  const today = dateKey(systemClock);
  const dates = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, index) => addDays(today, -index)),
    [today],
  );

  const from = dates[dates.length - 1] ?? today;
  const to = dates[0] ?? today;

  const checkins = useLiveQuery(
    () => db.checkins.where('date').between(from, to, true, true).toArray(),
    [from, to],
    [] as Checkin[],
  );

  const sessions = useLiveQuery(
    () => db.sessions.where('date').between(from, to, true, true).toArray(),
    [from, to],
    [] as StudySession[],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Checkin>();
    for (const record of checkins) map.set(record.date, record);
    return map;
  }, [checkins]);

  // 有番茄钟记录的日子自动视为已打卡
  const autoDates = useMemo(() => new Set(sessions.map((item) => item.date)), [sessions]);

  const activeDates = useMemo(() => {
    const set = new Set<string>(autoDates);
    for (const record of checkins) {
      if (record.done) set.add(record.date);
    }
    return set;
  }, [autoDates, checkins]);

  const streak = useMemo(() => streakOf(activeDates, today), [activeDates, today]);
  const total = useMemo(
    () => dates.filter((date) => activeDates.has(date)).length,
    [dates, activeDates],
  );

  const toggle = useCallback(async (date: string, done: boolean) => {
    await setCheckin(db, { date, done }, Date.now());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-6">
        <span className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{streak}</span>
          <span className="text-sm opacity-50">天连续</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{total}</span>
          <span className="text-sm opacity-50">/ {WINDOW_DAYS} 天有学习</span>
        </span>
      </div>

      <ul className="space-y-1.5">
        {dates.map((date) => {
          const record = byDate.get(date);
          const auto = autoDates.has(date);
          const done = record?.done ?? auto;
          return (
            <li key={date} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void toggle(date, !done)}
                aria-label={`${date} 打卡`}
                className={`size-5 shrink-0 rounded border transition ${
                  done
                    ? 'border-[var(--color-ink)] bg-[var(--color-ink)]'
                    : 'border-black/20 bg-white/60'
                }`}
              />
              <span className={`text-sm tabular-nums ${date === today ? 'font-medium' : ''}`}>
                {date}
                {date === today ? ' · 今天' : ''}
              </span>
              {auto && !record?.done ? (
                <span className="text-[10px] opacity-35">有学习记录</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] leading-relaxed opacity-35">
        有番茄钟记录的日子自动算作已打卡；手动勾选用于补录。连续天数由两者合并计算。
      </p>
    </div>
  );
}
