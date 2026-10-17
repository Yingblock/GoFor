import { systemClock } from '@gofor/core';
import { formatClock, progress, remainingMs } from '@gofor/core/pomodoro';
import { type PomodoroController, usePomodoro } from '../pomodoro/usePomodoro.ts';

/** 快捷时长（分钟）。默认值来自配置推导的课时，通常也是 45。 */
const MINUTE_PRESETS = [25, 45, 90];

const chipBase = 'rounded-full px-3 py-1.5 text-xs transition';
const chipOn = 'bg-[var(--color-ink)] text-white';
const chipOff = 'border border-black/10 bg-white/60 hover:bg-white';

/**
 * 番茄钟界面。
 *
 * 只做展示：所有时间数值都从 `run` + `systemClock` 现算，
 * 不缓存倒计时数字，这样切后台、锁屏、改系统时间都不会让计时失真。
 */
export function Pomodoro() {
  const controller = usePomodoro();
  return controller.run ? (
    <FocusSession controller={controller} />
  ) : (
    <FocusSetup controller={controller} />
  );
}

/** 无运行态：选时长、科目、可选任务，然后开始。 */
function FocusSetup({ controller }: { controller: PomodoroController }) {
  const options = MINUTE_PRESETS.includes(controller.minutes)
    ? MINUTE_PRESETS
    : [controller.minutes, ...MINUTE_PRESETS];
  const subject = controller.subjects.find((item) => item.id === controller.subjectId);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium opacity-50">这一节课多长</h2>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => controller.selectMinutes(option)}
              className={`${chipBase} ${controller.minutes === option ? chipOn : chipOff}`}
            >
              {option} 分钟
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium opacity-50">科目</h2>
        {controller.subjects.length === 0 ? (
          <p className="text-xs opacity-40">正在准备科目…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {controller.subjects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => controller.selectSubject(item.id)}
                className={`${chipBase} ${controller.subjectId === item.id ? chipOn : chipOff}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">绑定任务</h2>
          <span className="text-[11px] opacity-35">可选 · 再点一次取消</span>
        </div>
        {controller.taskCandidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-4 text-center text-xs opacity-40">
            {controller.tasks.length === 0 ? '还没有作业，不绑也能开始' : '今天的作业都完成了'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {controller.taskCandidates.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => controller.toggleTask(task.id)}
                className={`${chipBase} max-w-full truncate ${
                  controller.taskId === task.id ? chipOn : chipOff
                }`}
              >
                {task.title}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-2">
        <button
          type="button"
          onClick={controller.start}
          disabled={controller.subjects.length === 0}
          className="w-full rounded-xl bg-[var(--color-ink)] px-6 py-4 text-base text-white transition hover:opacity-90 disabled:opacity-30"
        >
          开始专注
        </button>
        <p className="text-center text-[11px] opacity-35">
          {controller.minutes} 分钟
          {subject ? ` · ${subject.name}` : ''}
          {controller.taskId ? ' · 已绑定任务' : ''}
        </p>
      </div>
    </div>
  );
}

/** 运行态：大字倒计时 + 进度条。 */
function FocusSession({ controller }: { controller: PomodoroController }) {
  const run = controller.run;
  if (!run) return null;

  const paused = run.status === 'paused';
  const remaining = formatClock(remainingMs(run, systemClock));
  const percent = Math.round(progress(run, systemClock) * 100);
  const plannedMinutes = Math.round(run.plannedMs / 60_000);
  const subject = controller.subjects.find((item) => item.id === run.subjectId);
  const task = controller.tasks.find((item) => item.id === run.taskId);

  return (
    <div className="mx-auto max-w-xl">
      <div className="relative rounded-2xl border border-black/[0.08] bg-white/60 px-5 py-8 text-center sm:px-8">
        <div className="flex items-baseline justify-between text-[11px] opacity-40">
          <span className="flex items-center gap-2">
            <span>
              {run.phase === 'focus' ? '专注' : '休息'} · {plannedMinutes} 分钟
            </span>
            {paused ? (
              <span className="rounded-full bg-black/[0.07] px-2 py-0.5 text-[10px] opacity-100">
                已暂停
              </span>
            ) : null}
          </span>
          <span>分心 {run.interruptions} 次</span>
        </div>

        <div className={`mt-8 transition-opacity ${paused ? 'opacity-40' : ''}`}>
          <div className="text-6xl font-semibold leading-none tracking-tight tabular-nums sm:text-7xl">
            {remaining}
          </div>
        </div>

        <p className="mt-4 truncate text-sm opacity-50">
          {subject?.name ?? '未选科目'}
          {task ? ` · ${task.title}` : ''}
        </p>

        <div
          role="progressbar"
          aria-label="专注进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-8 h-2 overflow-hidden rounded-full bg-black/[0.06]"
        >
          <div
            className="h-full rounded-full bg-[var(--color-ink)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={paused ? controller.resume : controller.pause}
          className="rounded-xl bg-[var(--color-ink)] px-4 py-3 text-sm text-white transition hover:opacity-90"
        >
          {paused ? '继续' : '暂停'}
        </button>
        <button
          type="button"
          onClick={controller.addDistraction}
          className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-sm transition hover:bg-white"
        >
          +1 分心
        </button>
        <button
          type="button"
          onClick={controller.finish}
          className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-sm transition hover:bg-white"
        >
          完成
        </button>
        <button
          type="button"
          onClick={controller.abandon}
          className="rounded-xl px-4 py-3 text-sm opacity-40 transition hover:opacity-70"
        >
          放弃
        </button>
      </div>
    </div>
  );
}
