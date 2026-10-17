/**
 * 自助工具箱：四种练习的脚本数据 + 「由已过毫秒算当前阶段」的纯函数。
 *
 * 这里刻意**不出现计时器**：当前阶段完全由调用方传入的 `elapsedMs` 决定。
 * 计时器（`setInterval`）只负责让界面重绘，暂停时只要不再增加 elapsedMs，
 * 阶段就不会漂移；后台被节流、切页再回来也不会「算慢」。
 *
 * 同时也不读 `Date.now()`：宿主用 `Clock` 算出已过毫秒再传进来，
 * 测试才能把时间钉死（见 AGENTS「领域约定」）。
 */

import type { ToolboxExercise } from '../domain/entities.ts';

/**
 * 练习 id。
 *
 * 直接复用领域实体 `ToolboxExercise`，不在这里再写一份字面量联合：
 * 两处各写一份，新增练习时必然出现「工具箱能练、但落库类型不认」的错位。
 * 下面的 `EXERCISES` 只要漏掉一个 id，类型检查就会报错。
 */
export type ExerciseId = ToolboxExercise;

export interface ExercisePhase {
  label: string;
  detail: string;
  seconds: number;
}

export interface Exercise {
  id: ExerciseId;
  name: string;
  summary: string;
  phases: ExercisePhase[];
}

/** 4-7-8 呼吸的轮数。 */
const BREATHING_ROUNDS = 4;

/** 渐进放松每段的时长（秒）：落在需求给的 20–30 秒区间内。 */
const RELAX_SEGMENT_SECONDS = 25;

/** 5-4-3-2-1 每段的时长（秒）。 */
const GROUNDING_SEGMENT_SECONDS = 20;

/** 身体扫描每段的时长（秒）。 */
const BODY_SCAN_SEGMENT_SECONDS = 30;

/**
 * 4-7-8 呼吸：吸 4 秒 / 屏 7 秒 / 呼 8 秒，循环 4 轮。
 *
 * 阶段直接展开成 12 段、`label` 里带轮次，而不是只存 3 段再靠取模算轮次：
 * 展开后 `progressAt` 对所有练习走同一条路径，界面也只需要显示 label，
 * 不必知道「第几轮」需要特殊处理。
 */
function breathingPhases(): ExercisePhase[] {
  const phases: ExercisePhase[] = [];
  for (let round = 1; round <= BREATHING_ROUNDS; round += 1) {
    phases.push({
      label: `第 ${round} 轮 · 吸气`,
      detail: '用鼻子慢慢吸气，心里数 4 秒',
      seconds: 4,
    });
    phases.push({
      label: `第 ${round} 轮 · 屏息`,
      detail: '轻轻屏住呼吸，心里数 7 秒',
      seconds: 7,
    });
    phases.push({
      label: `第 ${round} 轮 · 呼气`,
      detail: '用嘴缓缓呼气，心里数 8 秒',
      seconds: 8,
    });
  }
  return phases;
}

/** 渐进放松：脚趾 → 小腿 → 大腿 → 腹部 → 肩 → 手臂 → 面部。 */
const RELAX_PHASES: readonly ExercisePhase[] = [
  {
    label: '脚趾',
    detail: '绷紧脚趾 5 秒，然后慢慢松开，感受放松传开',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '小腿',
    detail: '收紧小腿 5 秒，再松开，让腿沉下来',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '大腿',
    detail: '绷紧大腿 5 秒，然后松开，注意膝盖周围的松',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '腹部',
    detail: '收腹 5 秒，再松开，让呼吸自然下沉',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '肩',
    detail: '耸肩到耳朵旁 5 秒，再放下，让肩膀离开耳朵',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '手臂',
    detail: '握拳并绷紧手臂 5 秒，再松开，手指自然摊开',
    seconds: RELAX_SEGMENT_SECONDS,
  },
  {
    label: '面部',
    detail: '皱脸 5 秒，再松开，让额头和下巴变软',
    seconds: RELAX_SEGMENT_SECONDS,
  },
];

/** 5-4-3-2-1 接地：看见 5 / 触摸 4 / 听见 3 / 闻到 2 / 尝到 1。 */
const GROUNDING_PHASES: readonly ExercisePhase[] = [
  {
    label: '看见 5 样东西',
    detail: '环顾四周，慢慢说出 5 样你能看见的东西',
    seconds: GROUNDING_SEGMENT_SECONDS,
  },
  {
    label: '触摸 4 样东西',
    detail: '找 4 样能摸到的东西，感受它的温度和质感',
    seconds: GROUNDING_SEGMENT_SECONDS,
  },
  {
    label: '听见 3 种声音',
    detail: '停下来听，找出 3 种不同的声音',
    seconds: GROUNDING_SEGMENT_SECONDS,
  },
  {
    label: '闻到 2 种气味',
    detail: '留意空气里的 2 种气味，找不到就回忆一种喜欢的味道',
    seconds: GROUNDING_SEGMENT_SECONDS,
  },
  {
    label: '尝到 1 种味道',
    detail: '感受嘴里的 1 种味道，或喝一口水',
    seconds: GROUNDING_SEGMENT_SECONDS,
  },
];

/** 身体扫描：头顶 → 面部 → 肩颈 → 胸腹 → 背 → 腿 → 脚。 */
const BODY_SCAN_PHASES: readonly ExercisePhase[] = [
  {
    label: '头顶',
    detail: '把注意力放在头顶，不评判，只是感受',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '面部',
    detail: '注意力移到额头、眼睛、下巴，让它们松开',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '肩颈',
    detail: '感受肩膀和脖子，呼气时让重量落下去',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '胸腹',
    detail: '注意胸口和肚子的起伏，跟着呼吸走',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '背',
    detail: '感受背部和椅子的接触，一节一节地放松',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '腿',
    detail: '注意力放到大腿和小腿，让它们变沉',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
  {
    label: '脚',
    detail: '最后到脚掌和脚趾，感受整只脚的温度',
    seconds: BODY_SCAN_SEGMENT_SECONDS,
  },
];

/** 工具箱里的四个练习，顺序即界面顺序。 */
export const EXERCISES: readonly Exercise[] = [
  {
    id: 'breathing-478',
    name: '4-7-8 呼吸',
    summary: '吸气 4 秒、屏息 7 秒、呼气 8 秒，做 4 轮，让心跳慢下来。',
    phases: breathingPhases(),
  },
  {
    id: 'relax',
    name: '渐进放松',
    summary: '从脚趾到面部逐段绷紧再松开，把身体的紧张一段段放掉。',
    phases: [...RELAX_PHASES],
  },
  {
    id: 'grounding-54321',
    name: '5-4-3-2-1 接地',
    summary: '用五种感官把注意力拉回当下，适合脑子停不下来的时候。',
    phases: [...GROUNDING_PHASES],
  },
  {
    id: 'bodyscan',
    name: '身体扫描',
    summary: '从头顶到脚，用 30 秒一段把注意力扫过全身。',
    phases: [...BODY_SCAN_PHASES],
  },
];

/** 按 id 取练习。id 来自类型联合，理论上必然存在，找不到说明数据表被改坏了。 */
export function exerciseById(id: ExerciseId): Exercise {
  const found = EXERCISES.find((exercise) => exercise.id === id);
  if (found === undefined) {
    throw new RangeError(`未知的练习：${id}`);
  }
  return found;
}

/** 练习总时长（秒），等于各阶段之和。 */
export function totalSeconds(exercise: Exercise): number {
  let total = 0;
  for (const phase of exercise.phases) {
    total += phase.seconds;
  }
  return total;
}

export interface ExerciseProgress {
  phaseIndex: number;
  phase: ExercisePhase;
  /** 该阶段还剩多少毫秒 */
  remainingMs: number;
  /** 整体进度 0–1 */
  progress: number;
  done: boolean;
}

/**
 * 负的 elapsedMs 按 0 处理；NaN 同理（调用方算错时退化成「刚开头」，而不是显示 NaN）。
 * ±Infinity 不特殊处理：+Infinity 大于总时长 → done，-Infinity → 0。
 */
function normalizeElapsed(elapsedMs: number): number {
  if (Number.isNaN(elapsedMs)) return 0;
  return Math.max(0, elapsedMs);
}

/**
 * 由「已过毫秒」算出当前阶段。
 *
 * 约定：
 * - 边界归下一阶段：`elapsedMs === 4000` 表示第一段 4 秒已经过完，进入第二段；
 * - 恰好到总时长 / 超出总时长：`done = true`，`phaseIndex` 停在最后一阶段，
 *   `remainingMs = 0`，`progress = 1`（不越界到「第 13 阶段」）；
 * - `progress` 永不小于 0 或大于 1。
 */
export function progressAt(exercise: Exercise, elapsedMs: number): ExerciseProgress {
  const lastIndex = exercise.phases.length - 1;
  const lastPhase = exercise.phases[lastIndex];
  if (lastPhase === undefined) {
    throw new RangeError(`练习「${exercise.id}」没有阶段`);
  }

  const totalMs = totalSeconds(exercise) * 1000;
  const elapsed = normalizeElapsed(elapsedMs);

  if (elapsed >= totalMs) {
    return {
      phaseIndex: lastIndex,
      phase: lastPhase,
      remainingMs: 0,
      progress: 1,
      done: true,
    };
  }

  let phaseStartMs = 0;
  for (let index = 0; index < exercise.phases.length; index += 1) {
    const phase = exercise.phases[index];
    if (phase === undefined) break;
    const phaseEndMs = phaseStartMs + phase.seconds * 1000;
    if (elapsed < phaseEndMs) {
      return {
        phaseIndex: index,
        phase,
        remainingMs: phaseEndMs - elapsed,
        progress: elapsed / totalMs,
        done: false,
      };
    }
    phaseStartMs = phaseEndMs;
  }

  // 上面的循环覆盖了 [0, totalMs)，只有浮点误差才能走到这里；按「已完成」收尾，
  // 不给界面一个 done=false 但找不到阶段的中间态。
  return {
    phaseIndex: lastIndex,
    phase: lastPhase,
    remainingMs: 0,
    progress: 1,
    done: true,
  };
}
