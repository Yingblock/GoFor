import { newId, systemClock } from '@gofor/core';
import { dateKey } from '@gofor/core/domain';
import {
  type Occurrence,
  occurrencesOn,
  type Rule,
  type Term,
  type TimetableData,
} from '@gofor/core/timetable';
import { db, loadTimetable, saveTimetable } from '@gofor/store';
import { useCallback, useEffect, useMemo, useState } from 'react';

const TERM_ID = 'default';

const DEFAULT_PERIODS = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:55', end: '09:40' },
  { index: 3, start: '10:00', end: '10:45' },
  { index: 4, start: '10:55', end: '11:40' },
  { index: 5, start: '14:00', end: '14:45' },
  { index: 6, start: '14:55', end: '15:40' },
  { index: 7, start: '16:00', end: '16:45' },
  { index: 8, start: '16:55', end: '17:40' },
];

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 'YYYY-MM-DD' 加减天数（UTC 换算，避开时区偏移）。 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** 这一周的周一。 */
function mondayOf(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const weekday = base.getUTCDay(); // 0=周日
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, offset);
}

function defaultData(): TimetableData {
  const term: Term = { id: TERM_ID, startDate: mondayOf(dateKey(systemClock)), weeks: 20 };
  return {
    term,
    courses: [],
    rules: [],
    overrides: [],
    periods: DEFAULT_PERIODS.map((period) => ({ ...period })),
    weekPatterns: [],
  };
}

/**
 * 库里的数据可能是坏的（用户可能导入过坏 JSON），所以读取必须防御。
 * 不合法就回退到默认数据，而不是让整页崩掉。
 */
function asTimetable(raw: unknown): TimetableData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<TimetableData>;
  if (!Array.isArray(candidate.courses)) return null;
  if (!Array.isArray(candidate.rules)) return null;
  if (!Array.isArray(candidate.overrides)) return null;
  if (!Array.isArray(candidate.periods) || candidate.periods.length === 0) return null;
  if (!Array.isArray(candidate.weekPatterns)) return null;
  const term = candidate.term;
  if (typeof term !== 'object' || term === null) return null;
  if (typeof term.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(term.startDate)) {
    return null;
  }
  if (typeof term.weeks !== 'number' || term.weeks < 1) return null;
  return candidate as TimetableData;
}

/** P1·M2 课程表：录入 + 周视图。 */
export function TimetableScreen() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [weekStart, setWeekStart] = useState(mondayOf(dateKey(systemClock)));
  const [saved, setSaved] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await loadTimetable(db, TERM_ID);
      if (raw === undefined) {
        setData(defaultData());
        return;
      }
      const parsed = asTimetable(raw);
      if (parsed) {
        setData(parsed);
      } else {
        setWarning('本地课表数据不完整，已载入默认作息；确认后点保存覆盖。');
        setData(defaultData());
      }
    })();
  }, []);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const today = dateKey(systemClock);

  const byDay = useMemo(() => {
    if (!data) return new Map<string, Occurrence[]>();
    return new Map(weekDates.map((date) => [date, occurrencesOn(date, data)]));
  }, [data, weekDates]);

  const update = useCallback((patch: (current: TimetableData) => TimetableData) => {
    setData((current) => (current ? patch(current) : current));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!data) return;
    await saveTimetable(db, TERM_ID, data, Date.now());
    setSaved(true);
    setWarning(null);
  }, [data]);

  if (!data) {
    return <div className="text-sm opacity-50">加载课表…</div>;
  }

  const periodCount = data.periods.length;
  const courseName = (id: string) => data.courses.find((item) => item.id === id)?.name ?? '?';

  return (
    <div className="space-y-8">
      {warning ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}
        </p>
      ) : null}

      {/* A. 学期与作息表 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-50">学期</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="opacity-60">开学日</span>
            <input
              type="date"
              value={data.term.startDate}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  term: { ...current.term, startDate: event.target.value },
                }))
              }
              className="rounded border border-black/10 bg-white/70 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="opacity-60">周数</span>
            <input
              type="number"
              min={1}
              max={30}
              value={data.term.weeks}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  term: { ...current.term, weeks: Number(event.target.value) },
                }))
              }
              className="w-16 rounded border border-black/10 bg-white/70 px-2 py-1"
            />
          </label>
        </div>

        <h3 className="pt-2 text-xs font-medium opacity-50">作息表</h3>
        <ul className="space-y-1">
          {data.periods.map((period, index) => (
            <li key={period.index} className="flex items-center gap-2 text-xs">
              <span className="w-8 tabular-nums opacity-40">{period.index}</span>
              <input
                type="time"
                value={period.start}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    periods: current.periods.map((item, position) =>
                      position === index ? { ...item, start: event.target.value } : item,
                    ),
                  }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <span className="opacity-30">—</span>
              <input
                type="time"
                value={period.end}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    periods: current.periods.map((item, position) =>
                      position === index ? { ...item, end: event.target.value } : item,
                    ),
                  }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <button
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    periods: current.periods
                      .filter((_, position) => position !== index)
                      .map((item, position) => ({ ...item, index: position + 1 })),
                  }))
                }
                className="text-[11px] opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            update((current) => ({
              ...current,
              periods: [
                ...current.periods,
                {
                  index: current.periods.length + 1,
                  start: '18:30',
                  end: '19:15',
                },
              ],
            }))
          }
          className="text-xs opacity-50 hover:opacity-80"
        >
          + 加一节
        </button>
      </section>

      {/* B. 课程与规则 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-50">课程与规则</h2>
        <CourseAdder
          onAdd={(name) =>
            update((current) => ({
              ...current,
              courses: [...current.courses, { id: newId(), name }],
            }))
          }
        />
        {data.courses.length === 0 ? (
          <p className="text-xs opacity-40">先加一门课，再排时间。</p>
        ) : (
          <RuleAdder
            courses={data.courses}
            periodCount={periodCount}
            onAdd={(rule) => update((current) => ({ ...current, rules: [...current.rules, rule] }))}
          />
        )}

        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-medium">{courseName(rule.courseId)}</span>
              <span className="opacity-50">
                {rule.byDay.map((day) => DAY_LABELS[day - 1]).join('、')} · 第 {rule.startPeriod} 节
                {rule.span && rule.span > 1 ? ` 连 ${rule.span} 节` : ''} ·{' '}
                {rule.intervalWeeks === 2 ? '单周' : '每周'}
              </span>
              <span className="flex-1" />
              <input
                type="date"
                aria-label={`${courseName(rule.courseId)} 停课日期`}
                onChange={(event) => {
                  const date = event.target.value;
                  if (!date) return;
                  update((current) => ({
                    ...current,
                    overrides: [
                      ...current.overrides,
                      { id: newId(), ruleId: rule.id, date, action: 'cancel' },
                    ],
                  }));
                }}
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <button
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    rules: current.rules.filter((item) => item.id !== rule.id),
                  }))
                }
                className="text-[11px] opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* C. 周视图 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border border-black/10 px-2 py-1 text-xs opacity-60"
          >
            ← 上一周
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(today))}
            className="rounded border border-black/10 px-2 py-1 text-xs opacity-60"
          >
            本周
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border border-black/10 px-2 py-1 text-xs opacity-60"
          >
            下一周 →
          </button>
          <span className="text-xs tabular-nums opacity-45">
            {weekDates[0]} ~ {weekDates[6]}
          </span>
        </div>

        <div
          className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white/50"
          data-testid="week-grid"
        >
          <div
            className="grid min-w-[640px] text-[11px]"
            style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}
          >
            <div className="border-b border-black/[0.06] p-1.5" />
            {weekDates.map((date, index) => (
              <div
                key={date}
                className={`border-b border-l border-black/[0.06] p-1.5 text-center ${
                  date === today ? 'bg-black/[0.05] font-medium' : 'opacity-60'
                }`}
              >
                {DAY_LABELS[index]}
                <span className="ml-1 opacity-50">{date.slice(5)}</span>
              </div>
            ))}

            {/* 基础网格：每节的空行 */}
            {data.periods.map((period, row) =>
              [-1, ...weekDates.keys()].map((column) => (
                <div
                  key={`${period.index}-${column}`}
                  className="h-10 border-b border-black/[0.04] border-l border-black/[0.06] px-1 py-0.5 tabular-nums"
                  style={{ gridColumn: column + 2, gridRow: row + 2 }}
                >
                  {column === -1 ? (
                    <span className="opacity-35">
                      {period.index}
                      <span className="ml-1 opacity-70">{period.start}</span>
                    </span>
                  ) : null}
                </div>
              )),
            )}

            {/* 课程块叠在网格上 */}
            {weekDates.flatMap((date, column) =>
              (byDay.get(date) ?? []).map((occurrence) => (
                <div
                  key={occurrence.key}
                  className="m-0.5 overflow-hidden rounded bg-[var(--color-ink)]/85 px-1.5 py-1 text-white"
                  style={{
                    gridColumn: column + 2,
                    gridRow: `${occurrence.startPeriod + 1} / span ${occurrence.span}`,
                  }}
                  title={`${courseName(occurrence.courseId)} ${occurrence.startMinute}-${occurrence.endMinute}`}
                >
                  {courseName(occurrence.courseId)}
                </div>
              )),
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
        >
          保存课表
        </button>
        {saved ? <span className="text-xs text-emerald-600">已保存</span> : null}
      </div>
    </div>
  );
}

function CourseAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          const value = name.trim();
          if (value) {
            onAdd(value);
            setName('');
          }
        }}
        placeholder="课程名，如 数学"
        className="w-40 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs outline-none"
      />
      <button
        type="button"
        onClick={() => {
          const value = name.trim();
          if (!value) return;
          onAdd(value);
          setName('');
        }}
        className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
      >
        加课程
      </button>
    </div>
  );
}

function RuleAdder({
  courses,
  periodCount,
  onAdd,
}: {
  courses: { id: string; name: string }[];
  periodCount: number;
  onAdd: (rule: Rule) => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [days, setDays] = useState<number[]>([1]);
  const [startPeriod, setStartPeriod] = useState(1);
  const [span, setSpan] = useState(1);
  const [intervalWeeks, setIntervalWeeks] = useState<1 | 2>(1);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-black/[0.12] p-2 text-xs">
      <select
        value={courseId}
        onChange={(event) => setCourseId(event.target.value)}
        className="rounded border border-black/10 bg-white/70 px-2 py-1"
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
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
          if (!courseId || days.length === 0) return;
          onAdd({
            id: newId(),
            courseId,
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
