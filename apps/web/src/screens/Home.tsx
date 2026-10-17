import {
  dateKey,
  type HabitLog,
  type StudySession,
  type Subject,
  type Task,
} from '@gofor/core/domain';
import { type Habit, isHabitActiveOn } from '@gofor/core/habits';
import { dayTotal, minutesOf, streakDays } from '@gofor/core/stats';
import {
  db,
  listHabitLogs,
  listHabits,
  listSubjects,
  setHabitLog,
  setTaskDone,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { appClock } from '../clock.ts';

/** 首页要能跳到打卡页和课表页，所以这两个 id 也进联合类型。 */
type HomeTarget = 'capture' | 'print' | 'pomodoro' | 'tasks' | 'checkin' | 'timetable';

/** 当日课表的一行：起止时间 + 科目名，由 App 从真实课表算好后传进来。 */
export interface HomeScheduleEntry {
  time: string;
  end: string;
  label: string;
}

export interface HomeProps {
  tasks: Task[];
  /** 当天课表；空数组表示今天没课或还没排课表。 */
  schedule: readonly HomeScheduleEntry[];
  onNavigate: (screen: HomeTarget) => void;
}

const STREAK_WINDOW_DAYS = 60;

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white/60 px-4 py-3">
      <div className="text-[11px] opacity-45">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {note ? <div className="mt-0.5 text-[10px] opacity-35">{note}</div> : null}
    </div>
  );
}

/** 'YYYY-MM-DD' 往前推 n 天。 */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 首页。
 *
 * 结构由用户规定（DESIGN §13.3）：顶部两个主行动 → 统计 → 任务提示。
 * 统计全部来自真实数据；没有数据就显示 0 并注明原因，不编数字。
 */
export function Home({ tasks, schedule, onNavigate }: HomeProps) {
  const today = dateKey(appClock);
  const since = useMemo(() => shiftDate(today, -STREAK_WINDOW_DAYS), [today]);

  const sessions = useLiveQuery(
    () => db.sessions.where('date').between(since, today, true, true).toArray(),
    [since, today],
    [] as StudySession[],
  );
  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);

  const habits = useLiveQuery(() => listHabits(db), [], [] as Habit[]);
  /*
   * 只取今天的日志：首页只需要回答"这项今天打了没有"，
   * 历史网格和连续天数在打卡页看。区间两端都写 today，
   * 未来日期的记录也就不会被误当成"今天已完成"。
   */
  const todayLogs = useLiveQuery(() => listHabitLogs(db, today, today), [today], [] as HabitLog[]);

  const done = tasks.filter((task) => task.done).length;
  const pending = tasks.length - done;

  const todayTotal = useMemo(() => dayTotal(sessions, today).minutes, [sessions, today]);
  const streak = useMemo(() => streakDays(sessions, today), [sessions, today]);
  const todaySessions = useMemo(
    () => sessions.filter((session) => session.date === today),
    [sessions, today],
  );

  // 该不该打卡完全由 isHabitActiveOn 现算，不落库——排期存两份必然不一致。
  const activeHabits = useMemo(
    () => habits.filter((habit) => isHabitActiveOn(habit, today)),
    [habits, today],
  );
  const doneHabitIds = useMemo(
    () => new Set(todayLogs.filter((log) => log.done).map((log) => log.habitId)),
    [todayLogs],
  );
  const pendingHabits = activeHabits.filter((habit) => !doneHabitIds.has(habit.id));
  const habitsDoneCount = activeHabits.length - pendingHabits.length;

  const unfinished = tasks.filter((task) => !task.done).slice(0, 5);
  const subjectName = (id: string | null): string =>
    id === null ? '未分类' : (subjects.find((item) => item.id === id)?.name ?? '未分类');

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate('capture')}
          className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-white/60 px-4 py-4 text-left transition hover:bg-white"
        >
          <span className="text-2xl">📷</span>
          <span>
            <span className="block text-sm font-medium">拍照录入</span>
            <span className="block text-[11px] opacity-45">把纸上的记录扫进来 · P2</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('print')}
          className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-white/60 px-4 py-4 text-left transition hover:bg-white"
        >
          <span className="text-2xl">🖨</span>
          <span>
            <span className="block text-sm font-medium">打印 checklist</span>
            <span className="block text-[11px] opacity-45">今日一张纸，带去学校</span>
          </span>
        </button>
      </div>

      {/* 今日课表：课表页排好就直接出现在这里，不用再点进去看今天上什么课 */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">今日课表</h2>
          <button
            type="button"
            onClick={() => onNavigate('timetable')}
            className="text-xs opacity-40 hover:opacity-70"
          >
            去排课表 →
          </button>
        </div>

        {schedule.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-4 text-center text-xs opacity-40">
            今天没有课
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {schedule.map((entry) => (
              <li
                key={`${entry.time}-${entry.label}`}
                className="flex items-center gap-3 px-4 py-2 text-sm"
              >
                <span className="w-11 shrink-0 tabular-nums opacity-45">{entry.time}</span>
                <span className="min-w-0 flex-1 break-words">{entry.label}</span>
                <span className="text-[11px] tabular-nums opacity-30">– {entry.end}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 打卡提示：与番茄钟无关，数据只来自 habitLogs（见 DESIGN §4.2.1） */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">打卡提示</h2>
          <span className="flex items-baseline gap-3">
            {activeHabits.length > 0 ? (
              <span className="text-[11px] tabular-nums opacity-35">
                {habitsDoneCount}/{activeHabits.length}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onNavigate('checkin')}
              className="text-xs opacity-40 hover:opacity-70"
            >
              去打卡页 →
            </button>
          </span>
        </div>

        {activeHabits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-4 text-center text-xs opacity-40">
            {habits.length === 0 ? '还没有打卡项，去打卡页新建一个' : '今天没有安排打卡'}
          </p>
        ) : pendingHabits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-4 text-center text-xs opacity-40">
            今天的打卡都完成了
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {pendingHabits.map((habit) => (
              <li key={habit.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {/*
                  首页只列「今天还没打」的项，所以勾选后直接写 done=true；
                  habitLogs 的 liveQuery 会刷新，这条自动消失，无需本地状态。
                */}
                <input
                  type="checkbox"
                  aria-label={`打卡 ${habit.name}`}
                  checked={false}
                  onChange={() => void setHabitLog(db, habit.id, today, true, appClock.now())}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 break-words">{habit.name}</span>
                <span className="text-[10px] opacity-30">待打卡</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium opacity-50">统计</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="今日作业" value={`${done}/${tasks.length}`} />
          <StatCard label="待办" value={String(pending)} />
          <StatCard
            label="今日专注"
            value={`${todayTotal} 分`}
            note={todayTotal === 0 ? '还没有番茄记录' : undefined}
          />
          {/*
            这个指标以前叫「连续打卡」，但它是用学习记录（sessions）算的——
            和打卡项是两回事。打卡是"我承诺做某事并对自己负责"，
            学习时长是"我花了多少时间"。混用会让两个数字互相污染。
            所以这里明确改名「连续学习」，打卡的连续天数在打卡页里算。
          */}
          <StatCard
            label="连续学习"
            value={`${streak} 天`}
            note={streak === 0 ? '今天还没有学习记录' : '按番茄钟/纸面记录计算'}
          />
        </div>
      </section>

      {todaySessions.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium opacity-50">今日记录</h2>
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {todaySessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="tabular-nums opacity-45">
                  {String(Math.floor((session.start % 1440) / 60)).padStart(2, '0')}:
                  {String(session.start % 60).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 break-words">{subjectName(session.subjectId)}</span>
                <span className="tabular-nums opacity-45">{minutesOf(session)} 分</span>
                <span className="text-[10px] opacity-30">
                  {session.source === 'appTimer' ? '番茄钟' : '纸面'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">任务提示</h2>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() => onNavigate('pomodoro')}
              className="text-xs opacity-40 hover:opacity-70"
            >
              开始专注 →
            </button>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs opacity-40 hover:opacity-70"
            >
              去作业清单 →
            </button>
          </span>
        </div>

        {unfinished.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-xs opacity-40">
            {tasks.length === 0 ? '还没有作业，先加一条' : '今天的作业都完成了'}
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {unfinished.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {/*
                  这里只列未完成任务，所以勾选后直接写 done=true；
                  写完 tasks 的 liveQuery 会刷新，这一条自动从列表里消失，
                  因此不需要维护本地 checked 状态。
                */}
                <input
                  type="checkbox"
                  aria-label={`完成 ${task.title}`}
                  checked={false}
                  onChange={() => void setTaskDone(db, task.id, true, Date.now())}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 break-words">{task.title}</span>
                {task.due ? <span className="text-[11px] opacity-40">{task.due}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
