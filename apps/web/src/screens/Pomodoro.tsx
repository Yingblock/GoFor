import { systemClock } from '@gofor/core';
import { formatClock, progress, remainingMs } from '@gofor/core/pomodoro';
import { useEffect, useState } from 'react';
import {
  MAX_MINUTES,
  MIN_MINUTES,
  type PomodoroController,
  usePomodoro,
} from '../pomodoro/usePomodoro.ts';

/** 快捷时长（分钟）。默认值来自配置推导的课时，通常也是 45。 */
const MINUTE_PRESETS = [25, 45, 90];

/**
 * 「确认放弃？」自动收回的毫秒数。
 *
 * 用 setTimeout 而不是领域层的 `Clock`：它只控制一个 UI 确认窗口的寿命，
 * 不参与任何计时计算（剩余时间每次都由 `remainingMs(run, systemClock)` 现算），
 * 所以不会影响「计时必须可确定性推进」这条约定。
 */
const ABANDON_CONFIRM_MS = 3000;

const chipBase = 'rounded-full px-3 py-1.5 text-xs transition';
const chipOn = 'bg-[var(--color-ink)] text-white';
const chipOff = 'border border-black/10 bg-white/60 hover:bg-white';

/** 遮罩里的按钮基类：等宽等高的 flex-1，确认态多出一个「取消」也不会把布局顶歪。 */
const overlayButtonBase = 'min-w-[8.5rem] flex-1 rounded-xl px-4 py-3 text-sm transition';
const overlayGhost = `${overlayButtonBase} border border-black/10 bg-white/60 hover:bg-white`;
const overlayQuiet = `${overlayButtonBase} opacity-40 hover:opacity-70`;
const overlayPrimary = `${overlayButtonBase} bg-[var(--color-ink)] text-white hover:opacity-90`;

/**
 * 番茄钟界面。
 *
 * 只做展示：所有时间数值都从 `run` + `systemClock` 现算，
 * 不缓存倒计时数字，这样切后台、锁屏、改系统时间都不会让计时失真。
 *
 * 两态互斥：有 `run` → 全屏遮罩；没有 `run` → 设置页。
 */
export function Pomodoro() {
  const controller = usePomodoro();
  return controller.run ? (
    <FocusSession controller={controller} />
  ) : (
    <FocusSetup controller={controller} />
  );
}

/** 无运行态：选时长（快捷项或自定义）、科目、可选任务，然后开始。 */
function FocusSetup({ controller }: { controller: PomodoroController }) {
  const subject = controller.subjects.find((item) => item.id === controller.subjectId);

  /*
   * 数字输入框保留「正在输入的原始文本」，而不是直接把 `controller.minutes` 塞回 value。
   * 原因：minutes 永远是钳位后的规范值，受控回写会让「清空重输」和「先敲 1 再敲 5」
   * 在输入途中被改写成别的值，光标还会跳。所以草稿归草稿，课时归课时。
   */
  const [draft, setDraft] = useState(() => String(controller.minutes));

  /*
   * 快捷项被点中、或重载恢复出历史时长时，minutes 会从外部变化，这时把输入框同步过去。
   * 如果草稿本身已经等于 minutes 就保留草稿（正常敲键盘的每一步都属于这种情况），
   * 避免每次输入都被 effect 覆盖导致光标错位。
   */
  useEffect(() => {
    setDraft((current) => {
      if (current.trim() === '') return current;
      return Number(current) === controller.minutes ? current : String(controller.minutes);
    });
  }, [controller.minutes]);

  const onMinutesInput = (raw: string) => {
    setDraft(raw);
    // 空值是「正在输入」的中间态，不能当成 0 去改 minutes，否则输入框永远清不掉。
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    // 输入即生效；钳位（1–180）由 hook 的 selectMinutes 统一做，这里不重复一套边界。
    controller.selectMinutes(parsed);
  };

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium opacity-50">这一节课多长</h2>
        <div className="flex flex-wrap items-center gap-2">
          {MINUTE_PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                controller.selectMinutes(option);
                // 输入框被清空过时，上面的 effect 会故意保留空草稿（不打断输入），
                // 所以快捷项这里显式写回，保证「点中快捷项 → 数字框显示同一个值」永远成立。
                setDraft(String(option));
              }}
              className={`${chipBase} ${controller.minutes === option ? chipOn : chipOff}`}
            >
              {option} 分钟
            </button>
          ))}

          <label
            htmlFor="pomodoro-custom-minutes"
            className="ml-auto flex items-center gap-2 text-xs"
          >
            <span className="opacity-50">自定义</span>
            <input
              id="pomodoro-custom-minutes"
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={1}
              value={draft}
              placeholder={String(controller.minutes)}
              onChange={(event) => onMinutesInput(event.target.value)}
              // 失焦时把草稿拉回真正的生效值：用户敲了 999 看到的是钳位后的 180，不留歧义。
              onBlur={() => setDraft(String(controller.minutes))}
              className="w-20 rounded-lg border border-black/10 bg-white/60 px-2 py-1.5 text-right text-sm tabular-nums transition focus:border-black/25 focus:outline-none"
            />
            <span className="opacity-50">分钟</span>
          </label>
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
          开始专注 {controller.minutes} 分钟
        </button>
        <p className="text-center text-[11px] opacity-35">
          全屏专注 · {subject?.name ?? '未选科目'}
          {controller.taskId ? ' · 已绑定任务' : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * 运行态：占满视口的专注遮罩。
 *
 * 为什么不用浏览器 Fullscreen API：它在 PWA / iOS / Android WebView 里行为不一致，
 * 且必须由用户手势触发，被拒绝时还会留下「看着像全屏其实不是」的状态。
 * 这里只是 `fixed inset-0` 的普通 DOM 遮罩，document 依旧活跃，
 * 所以 usePomodoro 里基于 `visibilitychange` 的追平与落库逻辑完全不受影响；
 * 遮罩也不改 DOM 结构上的任何计时输入，tick 仍然只负责触发重渲染。
 */
function FocusSession({ controller }: { controller: PomodoroController }) {
  const run = controller.run;

  // 放弃是破坏性操作：第一次点击只把按钮切成确认态，第二次才真正结算。
  // 不用 window.confirm：部分 WebView / 独立 PWA 会直接吞掉它，用户点了没反应。
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);

  useEffect(() => {
    if (!confirmingAbandon) return;
    // 3 秒后自动收回，避免确认态一直挂着——那样它就等于没有二次确认。
    // cleanup 保证：再次点击、组件卸载（结算后回到设置页）都不会留下悬挂定时器。
    const timer = window.setTimeout(() => setConfirmingAbandon(false), ABANDON_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingAbandon]);

  if (!run) return null;

  const paused = run.status === 'paused';
  const remaining = formatClock(remainingMs(run, systemClock));
  const percent = Math.round(progress(run, systemClock) * 100);
  const plannedMinutes = Math.round(run.plannedMs / 60_000);
  const subject = controller.subjects.find((item) => item.id === run.subjectId);
  const task = controller.tasks.find((item) => item.id === run.taskId);

  const startAbandonConfirm = () => setConfirmingAbandon(true);
  const confirmAbandon = () => {
    setConfirmingAbandon(false);
    controller.abandon();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="专注进行中"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-paper)] text-[var(--color-ink)]"
    >
      {/*
       * 顶部只留一个极小的出口，语义是「暂停」而不是「返回」：
       * - 这个组件拿不到路由（本次改动不许碰 App.tsx / nav.ts），无法真跳走；
       * - 暂停是不丢计时的最小代价，遮罩保持还能提示「这次专注没结束」，
       *   继续、完成、放弃都在下方按钮组里。
       */}
      <div className="flex justify-end px-4 py-3">
        <button
          type="button"
          onClick={paused ? controller.resume : controller.pause}
          className="rounded-full px-2 py-1 text-[11px] opacity-35 transition hover:opacity-60"
        >
          {paused ? '继续专注' : '退出专注'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-10 text-center">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] opacity-40">
          <span>
            {run.phase === 'focus' ? '专注' : '休息'} · {plannedMinutes} 分钟
          </span>
          {paused ? (
            <span className="rounded-full bg-black/[0.07] px-2 py-0.5 text-[10px] normal-case tracking-normal">
              已暂停
            </span>
          ) : null}
        </div>

        <div
          className={`text-7xl font-semibold leading-none tracking-tight tabular-nums transition-opacity sm:text-8xl lg:text-9xl ${
            paused ? 'opacity-40' : ''
          }`}
        >
          {remaining}
        </div>

        <div className="w-full max-w-md">
          <div
            role="progressbar"
            aria-label="专注进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-black/[0.06]"
          >
            <div
              className="h-full rounded-full bg-[var(--color-ink)]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-4 truncate text-sm opacity-50">
            {subject?.name ?? '未选科目'}
            {task ? ` · ${task.title}` : ''}
          </p>
          <p className="mt-1 text-[11px] opacity-35">分心 {run.interruptions} 次</p>
        </div>

        <div className="flex w-full max-w-md flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={paused ? controller.resume : controller.pause}
            className={overlayGhost}
          >
            {paused ? '继续' : '暂停'}
          </button>
          <button type="button" onClick={controller.addDistraction} className={overlayGhost}>
            +1 分心
          </button>
          <button type="button" onClick={controller.finish} className={overlayGhost}>
            完成
          </button>
          {confirmingAbandon ? (
            <>
              <button type="button" onClick={confirmAbandon} className={overlayPrimary}>
                确认放弃？
              </button>
              <button
                type="button"
                onClick={() => setConfirmingAbandon(false)}
                className={overlayGhost}
              >
                取消
              </button>
            </>
          ) : (
            <button type="button" onClick={startAbandonConfirm} className={overlayQuiet}>
              放弃
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
