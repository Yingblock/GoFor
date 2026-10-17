import { newId } from '@gofor/core';
import type { Subject } from '@gofor/core/domain';
import {
  addCancelOverride,
  DAY_LABELS,
  removeRule,
  type TimetableData,
} from '@gofor/core/timetable';

import { CourseLabel, UNKNOWN_SUBJECT_LABEL } from './CourseLabel.tsx';
import { RuleAdder } from './RuleAdder.tsx';
import { SubjectManager } from './SubjectManager.tsx';

export interface CoursesSectionProps {
  data: TimetableData;
  subjects: Subject[];
  subjectError: string | null;
  subjectById: ReadonlyMap<string, Subject>;
  update: (patch: (current: TimetableData) => TimetableData) => void;
  onCreateSubject: (name: string) => Promise<void>;
  onRenameSubject: (id: string, name: string) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
}

/**
 * B. 课程与规则。
 *
 * 科目写操作（增/改名/删）由外壳提供，这里只摆按钮；
 * 「停课一次」与「删除规则」走 core 的纯函数，保证单测覆盖得到。
 */
export function CoursesSection({
  data,
  subjects,
  subjectError,
  subjectById,
  update,
  onCreateSubject,
  onRenameSubject,
  onDeleteSubject,
}: CoursesSectionProps) {
  const periodCount = data.periods.length;
  // 外壳用的是 handle* 命名，子组件里保持一致，免得同一件事两个名字
  const handleCreateSubject = onCreateSubject;
  const handleRenameSubject = onRenameSubject;
  const handleDeleteSubject = onDeleteSubject;
  const courseLabel = (id: string): string => subjectById.get(id)?.name ?? UNKNOWN_SUBJECT_LABEL;

  return (
    <>
      {/* B. 科目与规则 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-50">课程与规则</h2>

        {/* B1. 科目管理：增 / 改名 / 删。科目只有这一份，其他页面共用。 */}
        <h3 className="text-xs font-medium opacity-50">科目（全局共用）</h3>
        <p className="text-[11px] leading-relaxed opacity-40">
          科目只存一份，番茄钟、作业、课表都读它，所以在这里改名或新增，别的页面也会跟着变。
        </p>
        {subjectError ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {subjectError}
          </p>
        ) : null}
        <SubjectManager
          subjects={subjects}
          onCreate={handleCreateSubject}
          onRename={handleRenameSubject}
          onDelete={handleDeleteSubject}
        />

        {/* B2. 排课规则：下拉列科目名，选中后规则里存 subject.id。 */}
        <h3 className="pt-2 text-xs font-medium opacity-50">排课规则</h3>
        {subjects.length === 0 ? (
          <p className="text-xs opacity-40">先在上面加一门科目，再排时间。</p>
        ) : (
          <RuleAdder
            subjects={subjects}
            periodCount={periodCount}
            onAdd={(rule) => update((current) => ({ ...current, rules: [...current.rules, rule] }))}
          />
        )}

        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-medium">
                <CourseLabel id={rule.courseId} lookup={subjectById} />
              </span>
              <span className="opacity-50">
                {rule.byDay.map((day) => DAY_LABELS[day - 1]).join('、')} · 第 {rule.startPeriod} 节
                {rule.span && rule.span > 1 ? ` 连 ${rule.span} 节` : ''} ·{' '}
                {rule.intervalWeeks === 2 ? '单周' : '每周'}
              </span>
              <span className="flex-1" />
              <input
                type="date"
                aria-label={`${courseLabel(rule.courseId)} 停课日期`}
                onChange={(event) => {
                  const date = event.target.value;
                  if (!date) return;
                  update((current) =>
                    addCancelOverride(current, { id: newId(), ruleId: rule.id, date }),
                  );
                }}
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <button
                type="button"
                onClick={() => update((current) => removeRule(current, rule.id))}
                className="text-[11px] opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
