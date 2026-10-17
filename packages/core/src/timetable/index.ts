/**
 * 课表子模块入口（`@gofor/core/timetable`，导出待统一添加）。
 *
 * 只暴露数据模型与展开函数；写数据（增删改）留给 `@gofor/store` 与编辑视图，
 * 这一层保持"给快照，算结果"的纯函数形态。
 */

export {
  isOddWeek,
  mergeAdjacent,
  occurrencesInWeek,
  occurrencesOn,
  patternOf,
  weekOfTerm,
} from './occurrences.ts';
export type {
  Course,
  Occurrence,
  Override,
  OverrideAction,
  Rule,
  Term,
  TimetableData,
  WeekPattern,
  WeekPatternRange,
} from './types.ts';
