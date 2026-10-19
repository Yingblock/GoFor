import { newId } from '@gofor/core';
import type { Subject } from '@gofor/core/domain';
import {
  addCancelOverride,
  DAY_LABELS,
  removeRule,
  type TimetableData,
} from '@gofor/core/timetable';
import { useState } from 'react';

import { CourseLabel, UNKNOWN_SUBJECT_LABEL } from './CourseLabel.tsx';
import { RuleAdder } from './RuleAdder.tsx';
import { SubjectManager } from './SubjectManager.tsx';

export interface CoursesSectionProps {
  data: TimetableData;
  subjects: Subject[];
  subjectError: string | null;
  /** `validateRules` 的结果。非空时红字展示，外壳据此禁止自动保存。 */
  ruleErrors: readonly string[];
  subjectById: ReadonlyMap<string, Subject>;
  update: (patch: (current: TimetableData) => TimetableData) => void;
  onCreateSubject: (name: string) => Promise<void>;
  onRenameSubject: (id: string, name: string) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
}

/** 筛选条的三个条件；0 / '' 都表示"全部"（不筛）。 */
const ALL_DAYS = 0;
const ALL_WEEKS = 0;

/**
 * B. 课程与规则。
 *
 * 科目写操作（增/改名/删）由外壳提供，这里只摆按钮；
 * 「停课一次」与「删除规则」走 core 的纯函数，保证单测覆盖得到。
 *
 * 筛选条只改**列表显示**，不碰 `data.rules`：它是"看"的工具，
 * 不该在筛选状态下删一行就顺手改掉数据范围。
 */
export function CoursesSection({
  data,
  subjects,
  subjectError,
  ruleErrors,
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

  const [courseFilter, setCourseFilter] = useState('');
  const [dayFilter, setDayFilter] = useState(ALL_DAYS);
  const [weekFilter, setWeekFilter] = useState(ALL_WEEKS);

  const hasFilter = courseFilter !== '' || dayFilter !== ALL_DAYS || weekFilter !== ALL_WEEKS;

  // 科目被删后规则还指着旧 id：筛选条里也给它留一个选项，否则这些规则只能靠"全部"看到。
  const unknownCourseIds = [
    ...new Set(
      data.rules.map((rule) => rule.courseId).filter((courseId) => !subjectById.has(courseId)),
    ),
  ];

  const filteredRules = data.rules.filter((rule) => {
    if (courseFilter !== '' && rule.courseId !== courseFilter) return false;
    if (dayFilter !== ALL_DAYS && !rule.byDay.includes(dayFilter)) return false;
    if (weekFilter !== ALL_WEEKS && rule.intervalWeeks !== weekFilter) return false;
    return true;
  });

  const clearFilters = () => {
    setCourseFilter('');
    setDayFilter(ALL_DAYS);
    setWeekFilter(ALL_WEEKS);
  };

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
        {ruleErrors.length > 0 ? (
          <ul className="space-y-0.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
            {[...new Set(ruleErrors)].map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {subjects.length === 0 ? (
          <p className="text-xs opacity-40">先在上面加一门科目，再排时间。</p>
        ) : (
          <RuleAdder
            subjects={subjects}
            periodCount={periodCount}
            onAdd={(rule) => update((current) => ({ ...current, rules: [...current.rules, rule] }))}
          />
        )}

        {/* B3. 筛选条：只影响下面的列表显示，不改数据。 */}
        {data.rules.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              aria-label="按科目筛选规则"
              className="rounded-sm border border-line bg-card-soft px-2 py-1"
            >
              <option value="">全部科目</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
              {unknownCourseIds.map((courseId) => (
                <option key={courseId} value={courseId}>
                  {UNKNOWN_SUBJECT_LABEL}
                </option>
              ))}
            </select>

            <select
              value={dayFilter}
              onChange={(event) => setDayFilter(Number(event.target.value))}
              aria-label="按星期筛选规则"
              className="rounded-sm border border-line bg-card-soft px-2 py-1"
            >
              <option value={ALL_DAYS}>全部星期</option>
              {DAY_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={weekFilter}
              onChange={(event) => setWeekFilter(Number(event.target.value))}
              aria-label="按每周单周筛选规则"
              className="rounded-sm border border-line bg-card-soft px-2 py-1"
            >
              <option value={ALL_WEEKS}>每周·单周</option>
              <option value={1}>每周</option>
              <option value={2}>单周</option>
            </select>

            {hasFilter ? (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-sm border border-line px-2 py-1 text-caption opacity-60"
              >
                清除筛选
              </button>
            ) : null}

            <span className="text-caption tabular-nums opacity-45">
              共 {data.rules.length} 条 · 显示 {filteredRules.length} 条
            </span>
          </div>
        ) : null}

        <ul className="divide-y divide-line rounded-xl border border-line bg-card-faint">
          {filteredRules.map((rule) => (
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
                className="rounded-sm border border-line bg-card-soft px-2 py-1"
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
          {filteredRules.length === 0 ? (
            <li className="px-3 py-2 text-small opacity-40">
              {hasFilter ? '没有符合筛选条件的规则。' : '还没有规则，先在上面加一条。'}
            </li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
