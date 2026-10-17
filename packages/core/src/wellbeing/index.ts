/** `@gofor/core/wellbeing`：行为层的纯逻辑（无计时器、无平台 API）。 */

export type { Exercise, ExerciseId, ExercisePhase, ExerciseProgress } from './exercises.ts';
export { EXERCISES, exerciseById, progressAt, totalSeconds } from './exercises.ts';
