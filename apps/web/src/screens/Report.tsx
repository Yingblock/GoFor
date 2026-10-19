import {
  type DiaryEntry,
  dateKey,
  type HabitLog,
  type MoodLog,
  type StudySession,
  type Subject,
  type ToolboxRun,
} from '@gofor/core/domain';
import { type Habit, isHabitActiveOn } from '@gofor/core/habits';
import { addDays, dayTotal, startOfWeek, subjectTotals, totalBetween } from '@gofor/core/stats';
import {
  db,
  listDiaryEntries,
  listHabitLogs,
  listHabits,
  listMoodLogs,
  listSubjects,
  listToolboxRuns,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { type ReactNode, useMemo } from 'react';
import { appClock } from '../clock.ts';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

/** 练习记录按开始时刻落的是墙钟毫秒，取日期时用本地日历（与 `dateKey` 同口径）。 */
function localDateKey(epochMs: number): string {
  const value = new Date(epochMs);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → 周一…周日。走 UTC，和日期键的日历语义一致。 */
function weekdayLabel(date: string): string {
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return WEEKDAY_LABELS[index] ?? '';
}

function StatCard({
  label,
  value,
  note,
  empty,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  empty?: boolean | undefined;
}) {
  return (
    <div className="rounded-xl border border-line bg-card-faint px-4 py-3">
      <div className="text-[11px] opacity-45">{label}</div>
      <div
        className={`mt-1 tabular-nums ${empty === true ? 'text-sm font-normal opacity-40' : 'text-xl font-semibold'}`}
      >
        {value}
      </div>
      {note ? <div className="mt-0.5 text-[10px] opacity-35">{note}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium opacity-50">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 自我周报：本周（周一到今天）的本地数据汇总。
 *
 * 原则：没有数据就写「还没有数据」，不拿 0 充当结论、也不编趋势。
 * 复习完成度要等 P4 的错题本 + SRS，这里只标注「P4 接入」，不显示假数字。
 */
export function ReportScreen() {
  const today = dateKey(appClock);
  const weekStart = startOfWeek(today);

  /** 周一…今天（最多 7 天）。 */
  const days = useMemo(() => {
    const list: string[] = [];
    for (let cursor = weekStart; cursor <= today; cursor = addDays(cursor, 1)) {
      list.push(cursor);
    }
    return list;
  }, [weekStart, today]);

  const sessions = useLiveQuery(
    () => db.sessions.where('date').between(weekStart, today, true, true).toArray(),
    [weekStart, today],
    [] as StudySession[],
  );
  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);
  const habits = useLiveQuery(() => listHabits(db), [], [] as Habit[]);
  const habitLogs = useLiveQuery(
    () => listHabitLogs(db, weekStart, today),
    [weekStart, today],
    [] as HabitLog[],
  );
  const moodLogs = useLiveQuery(
    () => listMoodLogs(db, weekStart, today),
    [weekStart, today],
    [] as MoodLog[],
  );
  const allRuns = useLiveQuery(() => listToolboxRuns(db, 200), [], [] as ToolboxRun[]);
  const diaryEntries = useLiveQuery(
    () => listDiaryEntries(db, weekStart, today),
    [weekStart, today],
    [] as DiaryEntry[],
  );

  const totalMinutes = useMemo(
    () => totalBetween(sessions, weekStart, today),
    [sessions, weekStart, today],
  );
  const daily = useMemo(
    () => days.map((date) => ({ date, minutes: dayTotal(sessions, date).minutes })),
    [days, sessions],
  );
  const maxDaily = useMemo(
    () => daily.reduce((max, entry) => Math.max(max, entry.minutes), 0),
    [daily],
  );

  /** 科目分布取前几：完整列表在统计里还有，周报只回答「时间花在哪」。 */
  const topSubjects = useMemo(() => subjectTotals(sessions).slice(0, 5), [sessions]);
  const subjectGroupCount = useMemo(() => subjectTotals(sessions).length, [sessions]);
  const subjectName = (id: string | null): string =>
    id === null ? '未分类' : (subjects.find((subject) => subject.id === id)?.name ?? '未分类');

  const checkin = useMemo(() => {
    if (habits.length === 0) return null;
    const doneKeys = new Set<string>();
    for (const log of habitLogs) {
      if (log.done) doneKeys.add(`${log.habitId}@${log.date}`);
    }
    let expected = 0;
    let completed = 0;
    for (const date of days) {
      for (const habit of habits) {
        if (!isHabitActiveOn(habit, date)) continue;
        expected += 1;
        if (doneKeys.has(`${habit.id}@${date}`)) completed += 1;
      }
    }
    return { expected, completed };
  }, [habits, habitLogs, days]);

  const moodSummary = useMemo(() => {
    if (moodLogs.length === 0) return null;
    let sleep = 0;
    let mood = 0;
    let focus = 0;
    for (const log of moodLogs) {
      sleep += log.sleep;
      mood += log.mood;
      focus += log.focus;
    }
    const count = moodLogs.length;
    return {
      count,
      sleep: sleep / count,
      mood: mood / count,
      focus: focus / count,
    };
  }, [moodLogs]);

  /** 练习记录落在本周（周一到今天）的那些。 */
  const weekRuns = useMemo(
    () =>
      allRuns.filter((run) => {
        const date = localDateKey(run.startedAt);
        return date >= weekStart && date <= today;
      }),
    [allRuns, weekStart, today],
  );
  const runSeconds = useMemo(
    () => weekRuns.reduce((total, run) => total + Math.max(0, run.seconds), 0),
    [weekRuns],
  );

  /**
   * 本周分心次数。
   *
   * 只在番茄钟（`source === 'appTimer'`）的学习记录里找：分心是用户主动点「我分心了」
   * 的 +1，结算时从运行态抄进 `session.interruptions`。它回答的是「这周有几次想走神」，
   * 不是屏幕时长，也不代表学了多久。
   */
  const distraction = useMemo(() => {
    const byDate = new Map<string, number>();
    let sessionCount = 0;
    let total = 0;
    for (const session of sessions) {
      if (session.source !== 'appTimer') continue;
      if (session.date < weekStart || session.date > today) continue;
      sessionCount += 1;
      // 旧版本的学习记录没有这个字段：按 0 处理，不猜。
      const count = Math.max(0, Math.floor(session.interruptions ?? 0));
      byDate.set(session.date, (byDate.get(session.date) ?? 0) + count);
      total += count;
    }
    const daily = days.map((date) => ({
      date,
      count: byDate.get(date) ?? 0,
      /** 当天到底有没有番茄记录：没有就显示「—」，不拿 0 冒充数据。 */
      hasRun: byDate.has(date),
    }));
    const maxDaily = daily.reduce((max, entry) => Math.max(max, entry.count), 0);
    return { sessionCount, total, daily, maxDaily };
  }, [sessions, days, weekStart, today]);

  const checkinRate =
    checkin !== null && checkin.expected > 0
      ? Math.round((checkin.completed / checkin.expected) * 100)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-sm font-medium opacity-50">自我周报</h2>
        <p className="mt-1 text-[11px] opacity-35">
          {weekStart} ~ {today}（周一到今天） · 全部数据来自本机
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="学习总时长"
          value={sessions.length === 0 ? '还没有数据' : `${totalMinutes} 分钟`}
          note={
            sessions.length === 0 ? '番茄钟与纸面记录都还没有' : `${sessions.length} 条学习记录`
          }
          empty={sessions.length === 0}
        />
        <StatCard
          label="打卡完成率"
          value={checkinRate === null ? '还没有数据' : `${checkinRate}%`}
          note={
            checkinRate === null
              ? '本周还没有到期的打卡项'
              : `${checkin?.completed ?? 0} / ${checkin?.expected ?? 0} 次`
          }
          empty={checkinRate === null}
        />
        <StatCard
          label="练习"
          value={weekRuns.length === 0 ? '还没有数据' : `${weekRuns.length} 次`}
          note={
            weekRuns.length === 0
              ? '自助工具箱还没开始'
              : `共 ${Math.round((runSeconds / 60) * 10) / 10} 分钟`
          }
          empty={weekRuns.length === 0}
        />
        <StatCard
          label="情绪日记"
          value={diaryEntries.length === 0 ? '还没有数据' : `${diaryEntries.length} 条`}
          note={diaryEntries.length === 0 ? '本周还没写' : '本周（周一到今天）'}
          empty={diaryEntries.length === 0}
        />
      </div>

      <Section title="每天学习分钟">
        {maxDaily === 0 ? (
          <p className="rounded-xl border border-line bg-card-faint px-4 py-6 text-center text-[11px] opacity-35">
            还没有数据
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-card-faint px-4 py-3">
            {daily.map((entry) => (
              <div key={entry.date} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 opacity-45">
                  {weekdayLabel(entry.date)} {entry.date.slice(5)}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-overlay">
                  <div
                    className="h-full rounded-full bg-[var(--color-strong)] opacity-70"
                    style={{
                      width: `${maxDaily === 0 ? 0 : Math.round((entry.minutes / maxDaily) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums opacity-60">
                  {entry.minutes} 分钟
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="分心次数（番茄钟 +1）">
        {distraction.sessionCount === 0 ? (
          <div className="space-y-1 rounded-xl border border-line bg-card-faint px-4 py-6 text-center text-[11px] opacity-35">
            <p>还没有数据</p>
            <p className="text-[10px] leading-relaxed opacity-80">
              番茄钟里点「我分心了」并完成番茄后，这里才有记录。
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-card-faint px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">{distraction.total} 次</span>
              <span className="text-[11px] opacity-40">本周（周一到今天）累计</span>
            </div>
            {distraction.daily.map((entry) => (
              <div key={entry.date} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 opacity-45">
                  {weekdayLabel(entry.date)} {entry.date.slice(5)}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-overlay">
                  <div
                    className="h-full rounded-full bg-[var(--color-strong)] opacity-70"
                    style={{
                      width: `${distraction.maxDaily === 0 ? 0 : Math.round((entry.count / distraction.maxDaily) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums opacity-60">
                  {entry.hasRun ? `${entry.count} 次` : '—'}
                </span>
              </div>
            ))}
            <p className="text-[10px] leading-relaxed opacity-30">
              只来自番茄钟里点「我分心了」的 +1 记录，结算时并入学习记录、按学习日期归到当天；
              不跟屏幕使用时长混为一谈。当天没有番茄记录时显示「—」，不补 0。
            </p>
          </div>
        )}
      </Section>

      <Section title="科目分布">
        {topSubjects.length === 0 ? (
          <p className="rounded-xl border border-line bg-card-faint px-4 py-6 text-center text-[11px] opacity-35">
            还没有数据
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-card-faint px-4 py-3">
            {topSubjects.map((entry) => {
              const percent =
                totalMinutes === 0 ? 0 : Math.round((entry.minutes / totalMinutes) * 100);
              return (
                <div
                  key={entry.subjectId ?? 'none'}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span className="w-20 shrink-0 truncate opacity-60">
                    {subjectName(entry.subjectId)}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-overlay">
                    <div
                      className="h-full rounded-full bg-[var(--color-strong)] opacity-50"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums opacity-60">
                    {entry.minutes} 分钟 · {percent}%
                  </span>
                </div>
              );
            })}
            {topSubjects.length < subjectGroupCount ? (
              <p className="pt-1 text-[10px] opacity-30">只显示前 {topSubjects.length} 个科目</p>
            ) : null}
          </div>
        )}
      </Section>

      <Section title="三滑块平均">
        {moodSummary === null ? (
          <p className="rounded-xl border border-line bg-card-faint px-4 py-6 text-center text-[11px] opacity-35">
            还没有数据
          </p>
        ) : (
          <div className="grid gap-2 rounded-xl border border-line bg-card-faint px-4 py-3 sm:grid-cols-3">
            {(
              [
                ['睡眠', moodSummary.sleep],
                ['心情', moodSummary.mood],
                ['专注', moodSummary.focus],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="opacity-50">{label}</span>
                <span className="tabular-nums font-medium">{value.toFixed(1)}</span>
              </div>
            ))}
            <p className="text-[10px] opacity-30 sm:col-span-3">
              共 {moodSummary.count} 天记录，按 1–5 求平均
            </p>
          </div>
        )}
      </Section>

      <Section title="复习完成度">
        <div className="rounded-xl border border-dashed border-line-strong bg-card-faint px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-overlay px-2 py-0.5 text-[10px] opacity-60">
              P4 接入
            </span>
            <span className="text-sm opacity-60">还没有数据</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed opacity-35">
            错题本与间隔复习属于 P4，当前版本还没有这份数据；这里不显示占位数字，也不估算。
          </p>
        </div>
      </Section>

      <p className="text-[10px] leading-relaxed opacity-30">
        周报只读本机数据：学习分钟来自 `sessions`，打卡来自 `habitLogs`，三滑块来自 `moodLogs`，
        练习来自 `toolboxRuns`，日记来自 `diaryEntries`，分心来自番茄钟结算时并入 `sessions` 的 +1
        记录。没有数据的项一律写「还没有数据」。
      </p>
    </div>
  );
}
