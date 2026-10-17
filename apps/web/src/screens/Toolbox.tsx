import { newId } from '@gofor/core';
import { EXERCISES, type Exercise, progressAt, totalSeconds } from '@gofor/core/wellbeing';
import { addToolboxRun, db } from '@gofor/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appClock } from '../clock.ts';

/** 显示刷新频率。只影响「多久重绘一次」，进度永远由已过毫秒现算，不是累加。 */
const TICK_MS = 250;

/** 秒数 → 「1 分 16 秒」。卡片上写准确时长，避免 76 秒被四舍五入成 2 分钟。 */
function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} 秒` : `${minutes} 分 ${rest} 秒`;
}

/**
 * 自助工具箱。
 *
 * 四种练习共用一套引导界面：阶段、剩余秒数、整体进度全部由
 * `progressAt(exercise, elapsedMs)` 算出。暂停 = 停止累计已过毫秒，
 * 恢复时把暂停时长扣掉；所以切后台被节流、锁屏再回来都不会算错。
 */
export function ToolboxScreen() {
  const [active, setActive] = useState<{ key: string; exercise: Exercise } | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <h2 className="text-sm font-medium opacity-50">自助工具箱</h2>
        <p className="mt-1 text-[11px] leading-relaxed opacity-35">
          四个短练习，挑一个开始就行。中途可以暂停或结束，做完会只记下「做了多久」。
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {EXERCISES.map((exercise) => (
          <div
            key={exercise.id}
            className="flex flex-col justify-between rounded-xl border border-black/[0.08] bg-white/50 p-4"
          >
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{exercise.name}</h3>
                <span className="shrink-0 text-[10px] tabular-nums opacity-35">
                  {durationLabel(totalSeconds(exercise))}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed opacity-50">{exercise.summary}</p>
            </div>
            <button
              type="button"
              onClick={() => setActive({ key: newId(), exercise })}
              className="mt-4 self-start rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white transition hover:opacity-90"
            >
              开始
            </button>
          </div>
        ))}
      </div>

      {active ? (
        <ExerciseSession
          key={active.key}
          exercise={active.exercise}
          onExit={() => setActive(null)}
        />
      ) : null}
    </div>
  );
}

interface ExerciseSessionProps {
  exercise: Exercise;
  onExit: () => void;
}

/** 一次练习的引导界面。key 由父级换新，重开时状态自然重置。 */
function ExerciseSession({ exercise, onExit }: ExerciseSessionProps) {
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState<'completed' | 'stopped' | null>(null);
  const [savedSeconds, setSavedSeconds] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setTick] = useState(0);

  /** 落库用的开始时刻（墙钟），以及计算已过毫秒的单调起点。 */
  const startedWallRef = useRef(appClock.now());
  const startedMonoRef = useRef(appClock.monotonic());
  const pauseStartedMonoRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  /** 防止「完成」与「结束」同时触发写两条记录。 */
  const finishedRef = useRef(false);

  /**
   * 已过毫秒（不含暂停）。暂停时把「暂停开始的时刻」当作当前时刻，
   * 于是暂停期间数值冻结，恢复时再把这整段加进 pausedTotal。
   */
  const readElapsedMs = useCallback((): number => {
    const now = appClock.monotonic();
    const segmentEnd = paused ? (pauseStartedMonoRef.current ?? now) : now;
    return Math.max(0, segmentEnd - startedMonoRef.current - pausedTotalRef.current);
  }, [paused]);

  // 只负责重绘；进度不在这里累加。
  useEffect(() => {
    if (paused || finished !== null) return;
    const timer = globalThis.setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => globalThis.clearInterval(timer);
  }, [paused, finished]);

  const finish = useCallback(
    async (kind: 'completed' | 'stopped') => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      const seconds = Math.max(0, Math.floor(readElapsedMs() / 1000));
      setFinished(kind);
      setSavedSeconds(seconds);

      try {
        await addToolboxRun(db, {
          id: newId(),
          exercise: exercise.id,
          startedAt: startedWallRef.current,
          // 中途结束按约定给 null；seconds 照记实际停留。
          completedAt: kind === 'completed' ? appClock.now() : null,
          seconds,
        });
        setNotice('已记下这次练习');
      } catch (caught) {
        setNotice(caught instanceof Error ? `记录失败：${caught.message}` : '记录失败');
      }
    },
    [exercise.id, readElapsedMs],
  );

  const progress = progressAt(exercise, readElapsedMs());
  const done = progress.done;

  // 到总时长自动收尾。用 effect 而不是在渲染里写库：渲染必须保持纯粹。
  useEffect(() => {
    if (finished !== null || !done) return;
    void finish('completed');
  }, [done, finished, finish]);

  const pause = () => {
    if (paused || finished !== null) return;
    pauseStartedMonoRef.current = appClock.monotonic();
    setPaused(true);
  };

  const resume = () => {
    const pausedAt = pauseStartedMonoRef.current;
    if (pausedAt !== null) {
      pausedTotalRef.current += appClock.monotonic() - pausedAt;
      pauseStartedMonoRef.current = null;
    }
    setPaused(false);
  };

  if (finished !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-paper)] px-6 text-[var(--color-ink)]">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-2xl font-medium">{finished === 'completed' ? '已完成' : '已结束'}</p>
          <p className="text-sm opacity-50">
            {finished === 'completed'
              ? `${exercise.name} · 全程 ${savedSeconds ?? 0} 秒`
              : `${exercise.name} · 停留 ${savedSeconds ?? 0} 秒`}
          </p>
          <p className="min-h-4 text-[11px] opacity-40">{notice ?? ''}</p>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl bg-[var(--color-ink)] px-5 py-2.5 text-sm text-white transition hover:opacity-90"
          >
            回到工具箱
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--color-paper)] text-[var(--color-ink)]">
      <header className="flex items-start justify-between gap-3 px-4 py-4 md:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{exercise.name}</h2>
          <p className="mt-0.5 text-[11px] opacity-35">
            第 {progress.phaseIndex + 1} / {exercise.phases.length} 段{paused ? ' · 已暂停' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void finish('stopped')}
          className="shrink-0 text-[11px] opacity-35 transition hover:opacity-60"
        >
          结束
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-12 text-center">
        <p className="text-3xl font-medium sm:text-4xl" aria-live="polite">
          {progress.phase.label}
        </p>
        <p className="max-w-md text-sm leading-relaxed opacity-50">{progress.phase.detail}</p>

        <div className="text-6xl font-semibold leading-none tabular-nums sm:text-7xl">
          {Math.ceil(progress.remainingMs / 1000)}
          <span className="ml-2 text-base font-normal opacity-35">秒</span>
        </div>

        <div className="w-full max-w-md">
          <div
            role="progressbar"
            aria-label="练习进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.progress * 100)}
            className="h-2 overflow-hidden rounded-full bg-black/[0.06]"
          >
            <div
              className="h-full rounded-full bg-[var(--color-ink)] transition-[width] duration-200"
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-[11px] opacity-35">
            {paused ? '暂停中，准备好再继续' : `${Math.round(progress.progress * 100)}%`}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={paused ? resume : pause}
            className="min-w-[8.5rem] rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-sm transition hover:bg-white"
          >
            {paused ? '继续' : '暂停'}
          </button>
          <button
            type="button"
            onClick={() => void finish('stopped')}
            className="min-w-[8.5rem] rounded-xl px-4 py-3 text-sm opacity-40 transition hover:opacity-70"
          >
            结束
          </button>
        </div>
      </main>
    </div>
  );
}
