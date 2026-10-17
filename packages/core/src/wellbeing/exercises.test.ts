import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseId } from './exercises.ts';
import { EXERCISES, exerciseById, progressAt, totalSeconds } from './exercises.ts';

/** 四个练习的 id，顺序与 EXERCISES 一致。 */
const ALL_IDS: ExerciseId[] = ['breathing-478', 'relax', 'grounding-54321', 'bodyscan'];

/** 取第 index 个阶段；越界直接让测试失败，而不是留下 undefined 往断言里传。 */
function phaseAt(exercise: Exercise, index: number) {
  const phase = exercise.phases[index];
  if (phase === undefined) throw new RangeError(`「${exercise.id}」没有第 ${index} 个阶段`);
  return phase;
}

/** 第 index 个阶段开始的毫秒数（各阶段 seconds 之和 × 1000）。 */
function phaseStartMs(exercise: Exercise, index: number): number {
  let seconds = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    seconds += phaseAt(exercise, cursor).seconds;
  }
  return seconds * 1000;
}

describe('EXERCISES：脚本数据', () => {
  it('恰好有四个练习，id 与 ExerciseId 一一对应', () => {
    expect(EXERCISES).toHaveLength(4);
    expect(EXERCISES.map((exercise) => exercise.id)).toEqual(ALL_IDS);
  });

  it('每个练习都有名字、说明和非空阶段', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.name.length).toBeGreaterThan(0);
      expect(exercise.summary.length).toBeGreaterThan(0);
      expect(exercise.phases.length).toBeGreaterThan(0);
    }
  });

  it('每个阶段的时长都是正整数秒，落在合理范围内', () => {
    for (const exercise of EXERCISES) {
      for (const phase of exercise.phases) {
        expect(Number.isInteger(phase.seconds)).toBe(true);
        expect(phase.seconds).toBeGreaterThan(0);
        expect(phase.seconds).toBeLessThanOrEqual(60);
        expect(phase.label.length).toBeGreaterThan(0);
        expect(phase.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('totalSeconds 等于各阶段之和', () => {
    for (const exercise of EXERCISES) {
      const sum = exercise.phases.reduce((total, phase) => total + phase.seconds, 0);
      expect(totalSeconds(exercise)).toBe(sum);
    }
  });

  it('四个练习的总时长分别是 76 / 175 / 100 / 210 秒', () => {
    expect(totalSeconds(exerciseById('breathing-478'))).toBe(76);
    expect(totalSeconds(exerciseById('relax'))).toBe(175);
    expect(totalSeconds(exerciseById('grounding-54321'))).toBe(100);
    expect(totalSeconds(exerciseById('bodyscan'))).toBe(210);
  });

  it('exerciseById 返回同一个对象，未知 id 抛错', () => {
    for (const exercise of EXERCISES) {
      expect(exerciseById(exercise.id)).toBe(exercise);
    }
    expect(() => exerciseById('nope' as ExerciseId)).toThrow(RangeError);
  });
});

describe('4-7-8 呼吸', () => {
  const breathing = exerciseById('breathing-478');

  it('4 轮 × 3 段，每轮时长依次是 4 / 7 / 8 秒', () => {
    expect(breathing.phases).toHaveLength(12);
    for (let round = 0; round < 4; round += 1) {
      const base = round * 3;
      expect(phaseAt(breathing, base).seconds).toBe(4);
      expect(phaseAt(breathing, base + 1).seconds).toBe(7);
      expect(phaseAt(breathing, base + 2).seconds).toBe(8);
    }
  });

  it('label 里带轮次，能算出「第几轮」', () => {
    for (let round = 1; round <= 4; round += 1) {
      const base = (round - 1) * 3;
      expect(phaseAt(breathing, base).label).toContain(`第 ${round} 轮`);
      expect(phaseAt(breathing, base + 1).label).toContain(`第 ${round} 轮`);
      expect(phaseAt(breathing, base + 2).label).toContain(`第 ${round} 轮`);
    }
    expect(phaseAt(breathing, 0).label).toContain('吸气');
    expect(phaseAt(breathing, 1).label).toContain('屏息');
    expect(phaseAt(breathing, 2).label).toContain('呼气');
  });
});

describe('渐进放松', () => {
  const relax = exerciseById('relax');

  it('按脚趾 → 小腿 → 大腿 → 腹部 → 肩 → 手臂 → 面部排列', () => {
    expect(relax.phases.map((phase) => phase.label)).toEqual([
      '脚趾',
      '小腿',
      '大腿',
      '腹部',
      '肩',
      '手臂',
      '面部',
    ]);
  });

  it('每段 20–30 秒', () => {
    for (const phase of relax.phases) {
      expect(phase.seconds).toBeGreaterThanOrEqual(20);
      expect(phase.seconds).toBeLessThanOrEqual(30);
    }
  });
});

describe('5-4-3-2-1 接地', () => {
  const grounding = exerciseById('grounding-54321');

  it('看见 5 / 触摸 4 / 听见 3 / 闻到 2 / 尝到 1，每段 20 秒', () => {
    expect(grounding.phases.map((phase) => phase.label)).toEqual([
      '看见 5 样东西',
      '触摸 4 样东西',
      '听见 3 种声音',
      '闻到 2 种气味',
      '尝到 1 种味道',
    ]);
    for (const phase of grounding.phases) {
      expect(phase.seconds).toBe(20);
    }
  });
});

describe('身体扫描', () => {
  const bodyscan = exerciseById('bodyscan');

  it('头顶 → 面部 → 肩颈 → 胸腹 → 背 → 腿 → 脚，每段 30 秒', () => {
    expect(bodyscan.phases.map((phase) => phase.label)).toEqual([
      '头顶',
      '面部',
      '肩颈',
      '胸腹',
      '背',
      '腿',
      '脚',
    ]);
    for (const phase of bodyscan.phases) {
      expect(phase.seconds).toBe(30);
    }
  });
});

describe('progressAt：0 与阶段中段', () => {
  const breathing = exerciseById('breathing-478');

  it('elapsed = 0 时停在第一阶段，剩余整段，进度 0，未完成', () => {
    expect(progressAt(breathing, 0)).toEqual({
      phaseIndex: 0,
      phase: phaseAt(breathing, 0),
      remainingMs: 4000,
      progress: 0,
      done: false,
    });
  });

  it('阶段中段按剩余毫秒计算，进度是整体比例', () => {
    const progress = progressAt(breathing, 1000);
    expect(progress.phaseIndex).toBe(0);
    expect(progress.remainingMs).toBe(3000);
    expect(progress.progress).toBeCloseTo(1000 / 76_000, 10);
    expect(progress.done).toBe(false);
  });

  it('第二阶段中段：剩余毫秒只算当前阶段', () => {
    const progress = progressAt(breathing, 6000);
    expect(progress.phaseIndex).toBe(1);
    expect(progress.remainingMs).toBe(5000);
    expect(progress.done).toBe(false);
  });
});

describe('progressAt：阶段边界', () => {
  const breathing = exerciseById('breathing-478');

  it('正好 4000ms（吸气结束）进入下一阶段，边界归下一段', () => {
    const progress = progressAt(breathing, 4000);
    expect(progress.phaseIndex).toBe(1);
    expect(progress.phase).toBe(phaseAt(breathing, 1));
    expect(progress.remainingMs).toBe(7000);
    expect(progress.progress).toBeCloseTo(4000 / 76_000, 10);
    expect(progress.done).toBe(false);
  });

  it('边界前一毫秒仍留在当前阶段', () => {
    const progress = progressAt(breathing, 3999);
    expect(progress.phaseIndex).toBe(0);
    expect(progress.remainingMs).toBe(1);
  });

  it('11 秒（吸气 + 屏息结束）进入第三阶段', () => {
    const progress = progressAt(breathing, 11_000);
    expect(progress.phaseIndex).toBe(2);
    expect(progress.remainingMs).toBe(8000);
  });

  it('5-4-3-2-1 在 20000ms 边界进入第二阶段', () => {
    const grounding = exerciseById('grounding-54321');
    const progress = progressAt(grounding, 20_000);
    expect(progress.phaseIndex).toBe(1);
    expect(progress.remainingMs).toBe(20_000);
    expect(progress.done).toBe(false);
  });

  it('最后一阶段开始的那一刻，进度仍不是完成态', () => {
    const lastStart = phaseStartMs(breathing, breathing.phases.length - 1);
    const progress = progressAt(breathing, lastStart);
    expect(progress.phaseIndex).toBe(breathing.phases.length - 1);
    expect(progress.remainingMs).toBe(8000);
    expect(progress.done).toBe(false);
  });
});

describe('progressAt：结束与超出总时长', () => {
  const breathing = exerciseById('breathing-478');
  const totalMs = totalSeconds(breathing) * 1000;

  it('正好到总时长：done，phaseIndex 停在最后一阶段，剩余 0，进度 1', () => {
    const progress = progressAt(breathing, totalMs);
    expect(progress.done).toBe(true);
    expect(progress.phaseIndex).toBe(breathing.phases.length - 1);
    expect(progress.phase).toBe(phaseAt(breathing, breathing.phases.length - 1));
    expect(progress.remainingMs).toBe(0);
    expect(progress.progress).toBe(1);
  });

  it('总时长前一毫秒还没完成', () => {
    const progress = progressAt(breathing, totalMs - 1);
    expect(progress.done).toBe(false);
    expect(progress.phaseIndex).toBe(breathing.phases.length - 1);
    expect(progress.remainingMs).toBe(1);
  });

  it('超出总时长：done，停在最后一阶段，不越界到不存在的阶段', () => {
    const progress = progressAt(breathing, totalMs + 60_000);
    expect(progress.done).toBe(true);
    expect(progress.phaseIndex).toBe(breathing.phases.length - 1);
    expect(progress.remainingMs).toBe(0);
    expect(progress.progress).toBe(1);
  });

  it('对四个练习，0 与 total 两端都符合约定', () => {
    for (const exercise of EXERCISES) {
      const total = totalSeconds(exercise) * 1000;
      expect(progressAt(exercise, 0).done).toBe(false);
      expect(progressAt(exercise, 0).phaseIndex).toBe(0);
      expect(progressAt(exercise, total).done).toBe(true);
      expect(progressAt(exercise, total).phaseIndex).toBe(exercise.phases.length - 1);
    }
  });
});

describe('progressAt：异常输入与不变量', () => {
  it('负数与 NaN 按 0 处理，不产生 NaN 进度', () => {
    const breathing = exerciseById('breathing-478');
    for (const elapsed of [-1, -100_000, Number.NaN]) {
      const progress = progressAt(breathing, elapsed);
      expect(progress.phaseIndex).toBe(0);
      expect(progress.remainingMs).toBe(4000);
      expect(progress.progress).toBe(0);
      expect(progress.done).toBe(false);
    }
  });

  it('+Infinity 视为已完成', () => {
    const progress = progressAt(exerciseById('relax'), Number.POSITIVE_INFINITY);
    expect(progress.done).toBe(true);
    expect(progress.progress).toBe(1);
  });

  it('阶段与进度单调向前，进度始终在 0–1 之间', () => {
    const bodyscan = exerciseById('bodyscan');
    let previousPhase = 0;
    let previousProgress = 0;
    for (let elapsed = 0; elapsed <= 210_000; elapsed += 500) {
      const progress = progressAt(bodyscan, elapsed);
      expect(progress.progress).toBeGreaterThanOrEqual(previousProgress);
      expect(progress.progress).toBeGreaterThanOrEqual(0);
      expect(progress.progress).toBeLessThanOrEqual(1);
      expect(progress.phaseIndex).toBeGreaterThanOrEqual(previousPhase);
      expect(progress.phaseIndex).toBeLessThan(bodyscan.phases.length);
      previousPhase = progress.phaseIndex;
      previousProgress = progress.progress;
    }
  });

  it('remainingMs 与 elapsed 在同一阶段内互补', () => {
    const grounding = exerciseById('grounding-54321');
    for (let index = 0; index < grounding.phases.length; index += 1) {
      const start = phaseStartMs(grounding, index);
      const lengthMs = phaseAt(grounding, index).seconds * 1000;
      const progress = progressAt(grounding, start + lengthMs / 2);
      expect(progress.phaseIndex).toBe(index);
      expect(progress.remainingMs).toBe(lengthMs / 2);
    }
  });

  it('progressAt 不修改练习数据', () => {
    const before = EXERCISES.map((exercise) => exercise.phases.length);
    for (const exercise of EXERCISES) {
      progressAt(exercise, 12_345);
      progressAt(exercise, 999_999);
    }
    expect(EXERCISES.map((exercise) => exercise.phases.length)).toEqual(before);
  });
});
