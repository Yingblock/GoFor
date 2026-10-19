import { formatClock, progress, remainingMs } from '@gofor/core/pomodoro';
import { useCallback, useEffect, useRef, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import {
  MAX_MINUTES,
  MIN_MINUTES,
  type PomodoroController,
  usePomodoro,
} from '../pomodoro/usePomodoro.ts';

/** 快捷时长（分钟）。默认值来自配置推导的课时，通常也是 45。 */
const MINUTE_PRESETS = [25, 45, 90];

/**
 * 「长按放弃」的判定阈值：按住满这么久才真的放弃。
 *
 * 放弃是破坏性操作，但二次点击（先点「放弃」再点「确认放弃？」）在专注遮罩里
 * 既打断节奏又多一次点击。长按把「确认」合并进同一个手势：误触一下不会结算，
 * 一直按着才会。
 */
const ABANDON_HOLD_MS = 5000;

/**
 * 长按进度的刷新间隔（约 20 帧/秒）。
 *
 * 只负责触发重渲染；进度本身由「按下时刻到现在的单调时钟差值」现算，
 * 绝不累加 tick——和番茄钟剩余时间的做法一致，被后台节流也不会算错。
 */
const ABANDON_HOLD_REFRESH_MS = 50;

const chipBase = 'rounded-full px-3 py-1.5 text-xs transition';
const chipOn = 'bg-[var(--color-strong)] text-on-strong';
const chipOff = 'border border-line bg-card-soft hover:bg-card';

/** 遮罩里的按钮基类：等宽等高的 flex-1，按钮文字长短不同也不会把布局顶歪。 */
const overlayButtonBase = 'min-w-[8.5rem] flex-1 rounded-xl px-4 py-3 text-sm transition';
const overlayGhost = `${overlayButtonBase} border border-line bg-card-soft hover:bg-card`;

/**
 * 番茄钟界面。
 *
 * 只做展示：所有时间数值都从 `run` + `appClock` 现算，
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
              className="w-20 rounded-lg border border-line bg-card-soft px-2 py-1.5 text-right text-sm tabular-nums transition focus:border-line-strong focus:outline-none"
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
          <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center text-xs opacity-40">
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
          className="w-full rounded-xl bg-[var(--color-strong)] px-6 py-4 text-base text-on-strong transition hover:opacity-90 disabled:opacity-30"
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
 * 「长按放弃」按钮：按住 5 秒才调用 `onAbandon`，中途松开/移出/失焦/切走都取消。
 *
 * 计时：按下时记一个单调时钟起点，之后每 `ABANDON_HOLD_REFRESH_MS` 用
 * 「现在 − 起点」现算已过毫秒并据此渲染进度；到点判定也用同一个差值。
 * 定时器只触发重渲染，不参与累加——后台节流最多让进度条少刷新几帧，
 * 不会让 5 秒提前或延后生效（页面隐藏时本来就直接取消了）。
 *
 * 进度条：按钮内部一个绝对定位的填充层，`transform: scaleX()` 从左往右铺开。
 * 它不占布局空间，填充多少都不会改变按钮尺寸、换行或相邻按钮的位置；
 * 文字单独一层压在上面，颜色是低透明度红，任何进度下都保持可读。
 */
function HoldAbandonButton({ onAbandon }: { onAbandon: () => void }) {
  /** 本轮长按已过的毫秒数；null 表示当前没在长按（进度条为 0）。 */
  const [heldMs, setHeldMs] = useState<number | null>(null);
  /** 本轮长按的单调时钟起点；null 表示不在长按中。 */
  const holdStartedAtRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  /** 到点后置 true：此后任何 tick / 松开事件都不允许再触发一次 abandon。 */
  const firedRef = useRef(false);

  const stopRefresh = useCallback(() => {
    if (refreshTimerRef.current === null) return;
    window.clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, []);

  /** 取消本轮长按并复位进度；已经到点触发的则原样保留（结算交给 controller）。 */
  const cancelHold = useCallback(() => {
    if (firedRef.current) return;
    stopRefresh();
    holdStartedAtRef.current = null;
    setHeldMs(null);
  }, [stopRefresh]);

  const startHold = useCallback(() => {
    // 已经在长按（重复的 pointerdown、键盘事件层的 repeat 都已挡住）就不再重开一轮。
    if (holdStartedAtRef.current !== null) return;
    firedRef.current = false;
    holdStartedAtRef.current = appClock.monotonic();
    setHeldMs(0);
    stopRefresh();
    refreshTimerRef.current = window.setInterval(() => {
      const startedAt = holdStartedAtRef.current;
      if (startedAt === null) return;
      const elapsed = appClock.monotonic() - startedAt;
      if (elapsed < ABANDON_HOLD_MS) {
        setHeldMs(elapsed);
        return;
      }
      // 先停表、清起点、置到点标记，再触发：到点后重复的 tick 或随后的
      // pointerup / keyup 都不可能再调用第二次 abandon。
      stopRefresh();
      holdStartedAtRef.current = null;
      firedRef.current = true;
      setHeldMs(ABANDON_HOLD_MS);
      onAbandon();
    }, ABANDON_HOLD_REFRESH_MS);
  }, [onAbandon, stopRefresh]);

  // 窗口失焦、切走标签页、锁屏都算「中途松手」：回来时绝不能已经按满 5 秒。
  // 监听器只挂一次；判定只依赖 ref，不依赖任何渲染期状态。
  useEffect(() => {
    const onWindowBlur = () => cancelHold();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelHold();
    };
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // 组件卸载（放弃结算完回到设置页）时不能留下悬挂的刷新定时器。
      stopRefresh();
    };
  }, [cancelHold, stopRefresh]);

  const holding = heldMs !== null;
  // 进度按已过毫秒现算；只用于显示，是否到点由上面 interval 的同一个差值判定。
  const fillRatio = heldMs === null ? 0 : Math.min(1, heldMs / ABANDON_HOLD_MS);

  return (
    <button
      type="button"
      aria-label="长按 5 秒放弃本次专注"
      onPointerDown={(event) => {
        // 只认主键：鼠标左键、触摸、笔尖的 button 都是 0，右键菜单不启动长按。
        if (event.button !== 0) return;
        startHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onPointerMove={(event) => {
        // 触摸时浏览器会在 pointerdown 后隐式捕获指针，手指滑出按钮不保证再发
        // pointerleave，所以按住期间用坐标兜一层「移出即取消」。
        if (holdStartedAtRef.current === null) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) cancelHold();
      }}
      onKeyDown={(event) => {
        // 按住不放时浏览器会持续发 repeat 的 keydown，不能把它当成重新开始。
        if (event.repeat) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // 阻止 Space 滚动页面，也阻止按钮原生的 Enter/Space 点击。
        event.preventDefault();
        startHold();
      }}
      onKeyUp={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        cancelHold();
      }}
      // 按钮自己失焦（Tab 走开、点了别处）同样算中途松手。
      onBlur={cancelHold}
      // 长按触发系统右键菜单/文字选择会打断手势，统一按掉；文案不被选中。
      onContextMenu={(event) => event.preventDefault()}
      className={`${overlayButtonBase} relative touch-none select-none overflow-hidden border border-line bg-card-soft ${
        holding ? 'opacity-100' : 'opacity-40 hover:opacity-70'
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left"
        style={{
          transform: `scaleX(${fillRatio})`,
          backgroundColor: 'color-mix(in srgb, #dc2626 22%, transparent)',
        }}
      />
      <span className="relative">长按放弃</span>
    </button>
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

  if (!run) return null;

  const paused = run.status === 'paused';
  const remaining = formatClock(remainingMs(run, appClock));
  const percent = Math.round(progress(run, appClock) * 100);
  const plannedMinutes = Math.round(run.plannedMs / 60_000);
  const subject = controller.subjects.find((item) => item.id === run.subjectId);
  const task = controller.tasks.find((item) => item.id === run.taskId);

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
            <span className="rounded-full bg-overlay px-2 py-0.5 text-[10px] normal-case tracking-normal">
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
            className="h-2 overflow-hidden rounded-full bg-overlay"
          >
            <div
              className="h-full rounded-full bg-[var(--color-strong)]"
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
          {/* 放弃必须按住 5 秒才生效，进度显示在按钮背景里。 */}
          <HoldAbandonButton onAbandon={controller.abandon} />
        </div>
      </div>
    </div>
  );
}
