import { dateKey, type StudySession, type Subject } from '@gofor/core/domain';
import { dayTotal, minutesOf, streakDays } from '@gofor/domain/stats';
import type { HomeBlockProps } from '@gofor/plugin-api';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '@gofor/plugin-kit';
import { pluginStore } from '@gofor/plugin-kit/store';
import { Card, Section, StatCard } from '@gofor/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

const STREAK_WINDOW_DAYS = 60;
const LINK_ACTION = 'text-small opacity-40 transition-opacity duration-fast hover:opacity-70';

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** 首页「学习统计」块：今日专注 / 连续学习 / 今日记录。 */
export function PomodoroHomeBlock({ host }: HomeBlockProps) {
  const store = pluginStore(host.store);
  const today = dateKey(appClock);
  const since = useMemo(() => shiftDate(today, -STREAK_WINDOW_DAYS), [today]);
  const sessions = useLiveQuery(
    () => store.sessionsRange(since, today),
    [store, since, today],
    [] as StudySession[],
  );
  const subjects = useLiveQuery(() => store.listSubjects(), [store], [] as Subject[]);

  const total = dayTotal(sessions, today).minutes;
  const streak = streakDays(sessions, today);
  const todaySessions = sessions.filter((session) => session.date === today);
  const subjectName = (id: string | null): string =>
    id === null ? '未分类' : (subjects.find((item) => item.id === id)?.name ?? '未分类');

  return (
    <div className="space-y-4">
      <Section
        title="统计"
        actions={
          <button
            type="button"
            onClick={() => host.navigate('gofor.pomodoro/screen')}
            className={LINK_ACTION}
          >
            去专注 →
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="今日专注"
            value={`${total} 分`}
            note={total === 0 ? '还没有番茄记录' : undefined}
          />
          <StatCard
            label="连续学习"
            value={`${streak} 天`}
            note={streak === 0 ? '今天还没有学习记录' : '按番茄钟/纸面记录计算'}
          />
        </div>
      </Section>

      {todaySessions.length > 0 ? (
        <Section title="今日记录">
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">
              {todaySessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-4 py-2 text-body">
                  <span className="tabular-nums opacity-45">
                    {String(Math.floor((session.start % 1440) / 60)).padStart(2, '0')}:
                    {String(session.start % 60).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {subjectName(session.subjectId)}
                  </span>
                  <span className="tabular-nums opacity-45">{minutesOf(session)} 分</span>
                  <span className="text-micro opacity-30">
                    {session.source === 'appTimer' ? '番茄钟' : '纸面'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
