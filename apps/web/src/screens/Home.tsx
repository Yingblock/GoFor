import type { StudySession, Task } from '@gofor/core/domain';

export interface HomeProps {
  tasks: Task[];
  sessions: StudySession[];
  onNavigate: (screen: 'capture' | 'print' | 'tasks') => void;
}

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

/**
 * 首页。
 *
 * 结构由用户规定（DESIGN §13.3）：顶部两个主行动 → 统计信息 → 任务提示。
 * 统计只显示真实数据；没有数据就显示 0 并注明原因，不编数字。
 */
export function Home({ tasks, sessions, onNavigate }: HomeProps) {
  const done = tasks.filter((task) => task.done).length;
  const pending = tasks.length - done;
  const focusMinutes = sessions.reduce((sum, session) => sum + (session.end - session.start), 0);
  const unfinished = tasks.filter((task) => !task.done).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* 顶部两个主行动 */}
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

      {/* 统计信息 */}
      <section>
        <h2 className="mb-3 text-sm font-medium opacity-50">统计</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="今日作业" value={`${done}/${tasks.length}`} />
          <StatCard label="待办" value={String(pending)} />
          <StatCard
            label="今日专注"
            value={`${focusMinutes} 分`}
            note={focusMinutes === 0 ? '番茄钟尚未开始（P1）' : undefined}
          />
          <StatCard label="连续打卡" value="—" note="打卡尚未开始（P1）" />
        </div>
      </section>

      {/* 任务提示 */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">任务提示</h2>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="text-xs opacity-40 hover:opacity-70"
          >
            去作业清单 →
          </button>
        </div>

        {unfinished.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-xs opacity-40">
            {tasks.length === 0 ? '还没有作业，先加一条' : '今天的作业都完成了'}
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {unfinished.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="size-3 rounded-sm border border-black/25" />
                <span className="flex-1">{task.title}</span>
                {task.due ? <span className="text-[11px] opacity-40">{task.due}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
