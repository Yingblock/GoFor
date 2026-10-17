import { newId } from '@gofor/core';
import { resolveUnitMinutes } from '@gofor/core/config';
import { dateKey, type Subject, type Task } from '@gofor/core/domain';
import {
  addInterruption,
  isComplete,
  type PomodoroRun,
  pauseRun,
  recoverRun,
  resumeRun,
  settleRun,
  startRun,
} from '@gofor/core/pomodoro';
import {
  addSession,
  currentConfigOrDefault,
  db,
  deleteFocusRun,
  ensureSubjects,
  listActiveFocusRuns,
  listSubjects,
  listTasks,
  saveFocusRun,
  sessionFromRun,
} from '@gofor/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';

const MS_PER_MINUTE = 60 * 1000;

/**
 * 自定义时长的合法区间（分钟）。
 *
 * 上限 180 是产品边界（一次专注超过 3 小时就不该算一个番茄），
 * 下限 1 是为了让 `plannedMs` 永远为正——`startRun` 也按 1 兜底，但 UI 层先拦住更清楚。
 * 这是交互约束，不是"现实世界会变的配置"，所以不进 `@gofor/core/config`。
 */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;

/**
 * 把任意分钟数收敛到合法区间。
 *
 * 钳位只放在这一处：快捷项和数字输入框最后都走 `selectMinutes`，
 * 如果各写一份，迟早出现「输入框钳了、`start` 没钳」的分叉，
 * 造出 0 分钟或者 500 分钟的番茄。非有限值（清空后的 NaN、Infinity）按最小合法值处理，不抛错。
 */
function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

export interface PomodoroController {
  /** 当前运行态；null 表示还没开始（或刚结算完）。 */
  run: PomodoroRun | null;
  subjects: Subject[];
  /** 全部任务：展示已绑定任务标题时要用，候选只取未完成的前 8 条。 */
  tasks: Task[];
  taskCandidates: Task[];
  /** 生效时长（分钟）：用户选过就用选的，否则用配置推导的课时。始终在 MIN_MINUTES–MAX_MINUTES 内。 */
  minutes: number;
  /** 生效科目：用户没显式选过就默认第一个。 */
  subjectId: string | null;
  taskId: string | null;
  selectMinutes: (minutes: number) => void;
  selectSubject: (id: string) => void;
  toggleTask: (id: string) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  addDistraction: () => void;
  finish: () => void;
  abandon: () => void;
}

/**
 * 番茄钟的 UI 状态层：状态机在 `@gofor/core/pomodoro`，这里只负责
 * React 状态、持久化与恢复。
 *
 * 计时原则：tick 只用来触发重渲染，剩余时间/进度每次渲染都从
 * `remainingMs(run, appClock)` 现算。绝对不能用 tick 累加——
 * 浏览器在后台会节流定时器，25 分钟会被拖成 40 分钟。
 */
export function usePomodoro(): PomodoroController {
  const [run, setRun] = useState<PomodoroRun | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unitMinutes, setUnitMinutes] = useState(45);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 只是重渲染开关，数值不依赖它。用于每秒刷新与回到前台时立即追平。
  const [, setTick] = useState(0);

  // 定时器回调需要读最新 run；闭包会停在创建时的旧状态，所以用 ref 跟住。
  const runRef = useRef<PomodoroRun | null>(null);

  // 结算要先写学习记录再删运行态，中间有异步窗口；
  // 用闸门挡住 tick 与手动点击造成的重复结算（否则会写两条学习记录）。
  const settlingRef = useRef(false);

  const settle = useCallback(async (target: PomodoroRun, status: 'finished' | 'abandoned') => {
    if (settlingRef.current) return;
    if (target.status !== 'running' && target.status !== 'paused') return;
    settlingRef.current = true;

    const settled = settleRun(target, appClock, status);
    try {
      await saveFocusRun(db, settled);
      // 放弃是用户主动中止，不是学习记录；只有真正完成才计入今日专注。
      if (status === 'finished') {
        await addSession(db, sessionFromRun(settled, dateKey(appClock)));
      }
    } finally {
      // 写记录失败也必须清掉运行态，否则界面会永远停在"已结算"。
      try {
        await deleteFocusRun(db, target.id);
      } finally {
        // 立刻清掉 ref：定时器可能在下一次 passive effect 之前又跑一轮，
        // 若它还指着旧的 running run，就会重复结算。
        runRef.current = null;
        setRun(null);
        // 这一条大概率已经做完了，下一次专注不该继续绑在它上面。
        setSelectedTaskId(null);
        settlingRef.current = false;
      }
    }
  }, []);

  /** tick 与回到前台时调用：到点就自动结算为完成。 */
  const checkComplete = useCallback(() => {
    const current = runRef.current;
    if (current?.status !== 'running') return;
    if (!isComplete(current, appClock)) return;
    void settle(current, 'finished');
  }, [settle]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // 首次启动播种默认科目；已有数据时是空操作。
      await ensureSubjects(db);
      const [configResult, subjectRows, taskRows, activeRuns] = await Promise.all([
        currentConfigOrDefault(db),
        listSubjects(db),
        listTasks(db),
        listActiveFocusRuns(db),
      ]);
      if (cancelled) return;

      setUnitMinutes(resolveUnitMinutes(configResult.config));
      setSubjects(subjectRows);
      setTasks(taskRows);

      // 正常运行中最多只有一条未结算的 run；若真有多条，只恢复最近开始的。
      const latest = [...activeRuns].sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!latest) return;

      // 页面刚加载时单调时钟已归零，必须用墙钟把锚点搬回当前进程，
      // 否则恢复出来的计时会从头开始，或者直接变成 0。
      const recovered = recoverRun(latest, appClock, appClock.now());
      setRun(recovered);
      // 恢复已选时长：历史数据可能是被改过的、或者小于 1 分钟的脏值，重新钳一次。
      setSelectedMinutes(clampMinutes(recovered.plannedMs / MS_PER_MINUTE));
      setSelectedSubjectId(recovered.subjectId);
      setSelectedTaskId(recovered.taskId);

      // 恢复出来就已经到点的，立即结算，不用等第一个 tick。
      if (recovered.status === 'running' && isComplete(recovered, appClock)) {
        void settle(recovered, 'finished');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settle]);

  // 每秒只触发一次重渲染并顺手检查是否到点；后台节流不会让计时变慢，
  // 因为剩余时间始终由 `remainingMs(run, appClock)` 现算。
  useEffect(() => {
    if (run?.status !== 'running') return;
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
      checkComplete();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [run?.status, checkComplete]);

  // 手机切回前台时浏览器可能压掉了定时器：立刻刷新并补一次到点检查。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      setTick((value) => value + 1);
      checkComplete();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkComplete]);

  const minutes = clampMinutes(selectedMinutes ?? unitMinutes);
  // 新同学第一次进来科目列表可能还没播种完，按第一个默认选中；
  // 已选科目若被删除也自然回落到第一个。
  const subjectId =
    subjects.find((subject) => subject.id === selectedSubjectId)?.id ?? subjects[0]?.id ?? null;

  const taskCandidates = useMemo(() => tasks.filter((task) => !task.done).slice(0, 8), [tasks]);

  const selectMinutes = useCallback((next: number) => {
    // 数字输入框会原样把用户敲的值送进来，钳位在这里统一做：
    // UI 只负责显示，边界由状态层保证，`start` 拿到的 minutes 一定合法。
    setSelectedMinutes(clampMinutes(next));
  }, []);
  const selectSubject = useCallback((id: string) => setSelectedSubjectId(id), []);
  const toggleTask = useCallback((id: string) => {
    setSelectedTaskId((current) => (current === id ? null : id));
  }, []);

  const start = useCallback(() => {
    if (run) return;
    // `minutes` 已经由 clampMinutes 保证是 1–180 的整数，这里只需要转成毫秒。
    const next = startRun(
      {
        id: newId(),
        plannedMs: minutes * MS_PER_MINUTE,
        subjectId,
        taskId: selectedTaskId,
      },
      appClock,
      appClock.now(),
    );
    setRun(next);
    void saveFocusRun(db, next);
  }, [minutes, run, selectedTaskId, subjectId]);

  const pause = useCallback(() => {
    if (run?.status !== 'running') return;
    const next = pauseRun(run, appClock);
    setRun(next);
    void saveFocusRun(db, next);
  }, [run]);

  const resume = useCallback(() => {
    if (run?.status !== 'paused') return;
    // 两个锚点的成对刷新由 core 的 resumeRun 负责，这里不要再补
    const next = resumeRun(run, appClock, appClock.now());
    setRun(next);
    void saveFocusRun(db, next);
  }, [run]);

  const addDistraction = useCallback(() => {
    if (!run) return;
    const next = addInterruption(run);
    setRun(next);
    void saveFocusRun(db, next);
  }, [run]);

  const finish = useCallback(() => {
    if (!run) return;
    void settle(run, 'finished');
  }, [run, settle]);

  const abandon = useCallback(() => {
    if (!run) return;
    void settle(run, 'abandoned');
  }, [run, settle]);

  return {
    run,
    subjects,
    tasks,
    taskCandidates,
    minutes,
    subjectId,
    taskId: selectedTaskId,
    selectMinutes,
    selectSubject,
    toggleTask,
    start,
    pause,
    resume,
    addDistraction,
    finish,
    abandon,
  };
}
