/**
 * `@gofor/core` 根入口：只放**无依赖的原语**。
 *
 * 配置相关（依赖 zod）走子路径 `@gofor/core/config`，
 * 这样只用到时钟/ID 的宿主不会把 zod 打进包里。
 */
export type { Clock, ManualClock, TimerHandle } from './clock.ts';
export { createManualClock, systemClock } from './clock.ts';
export { newId } from './ids.ts';
