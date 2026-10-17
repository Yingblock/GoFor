import { newId } from '@gofor/core';
import type { Subject } from '@gofor/core/domain';
import { DAY_LABELS, type Rule } from '@gofor/core/timetable';
import { useState } from 'react';

export function RuleAdder({
  subjects,
  periodCount,
  onAdd,
}: {
  subjects: Subject[];
  periodCount: number;
  onAdd: (rule: Rule) => void;
}) {
  const [courseId, setCourseId] = useState(subjects[0]?.id ?? '');
  const [days, setDays] = useState<number[]>([1]);
  const [startPeriod, setStartPeriod] = useState(1);
  const [span, setSpan] = useState(1);
  const [intervalWeeks, setIntervalWeeks] = useState<1 | 2>(1);

  // 选中的科目可能刚在管理区被删掉；这种情况下退回第一个科目，
  // 而不是留一个已经不存在、会让 select 显示空白的 id。
  const activeCourseId = subjects.some((subject) => subject.id === courseId)
    ? courseId
    : (subjects[0]?.id ?? '');

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-black/[0.12] p-2 text-xs">
      <select
        value={activeCourseId}
        onChange={(event) => setCourseId(event.target.value)}
        aria-label="科目"
        className="rounded border border-black/10 bg-white/70 px-2 py-1"
      >
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>

      <span className="flex gap-1">
        {DAY_LABELS.map((label, index) => {
          const day = index + 1;
          const active = days.includes(day);
          return (
            <button
              key={label}
              type="button"
              onClick={() =>
                setDays((current) =>
                  current.includes(day)
                    ? current.filter((item) => item !== day)
                    : [...current, day].sort((a, b) => a - b),
                )
              }
              aria-pressed={active}
              className={`rounded border px-1.5 py-0.5 ${
                active
                  ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white'
                  : 'border-black/10'
              }`}
            >
              {label.slice(1)}
            </button>
          );
        })}
      </span>

      <label className="flex items-center gap-1">
        <span className="opacity-60">第</span>
        <input
          type="number"
          min={1}
          max={periodCount}
          value={startPeriod}
          onChange={(event) => setStartPeriod(Number(event.target.value))}
          className="w-14 rounded border border-black/10 bg-white/70 px-1.5 py-0.5"
        />
        <span className="opacity-60">节，连</span>
        <input
          type="number"
          min={1}
          max={4}
          value={span}
          onChange={(event) => setSpan(Number(event.target.value))}
          className="w-12 rounded border border-black/10 bg-white/70 px-1.5 py-0.5"
        />
        <span className="opacity-60">节</span>
      </label>

      <select
        value={intervalWeeks}
        onChange={(event) => setIntervalWeeks(event.target.value === '2' ? 2 : 1)}
        className="rounded border border-black/10 bg-white/70 px-2 py-1"
      >
        <option value={1}>每周</option>
        <option value={2}>单周</option>
      </select>

      <button
        type="button"
        onClick={() => {
          if (!activeCourseId || days.length === 0) return;
          onAdd({
            id: newId(),
            // 这里存的是 subjects 表的科目 id（不是旧版自建课程 id），
            // 所以番茄钟/作业和课表看到的是同一个科目。
            courseId: activeCourseId,
            byDay: days,
            intervalWeeks,
            startPeriod,
            span,
          });
        }}
        className="rounded-lg bg-[var(--color-ink)] px-3 py-1.5 text-xs text-white"
      >
        加规则
      </button>
    </div>
  );
}
