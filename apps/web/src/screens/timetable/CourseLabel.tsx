import type { Subject } from '@gofor/core/domain';

/** 科目被删掉后，规则里指向它的 courseId 只剩一个"没有名字的 id"。 */
export const UNKNOWN_SUBJECT_LABEL = '未知科目（已删除）';

/**
 * 科目名展示。
 *
 * 查不到就降级成灰字「未知科目（已删除）」：旧数据的 courseId 指向旧版课程表，
 * 或者科目刚被删，都走这条路。绝不因为查不到就渲染 `?` 或直接崩。
 */
export function CourseLabel({
  id,
  lookup,
  unknownClassName = 'italic text-muted',
}: {
  id: string;
  lookup: ReadonlyMap<string, Subject>;
  /** 深色课程块里默认的灰色读不清，所以允许调用方覆盖。 */
  unknownClassName?: string;
}) {
  const subject = lookup.get(id);
  if (subject) return <>{subject.name}</>;
  return <span className={unknownClassName}>{UNKNOWN_SUBJECT_LABEL}</span>;
}
