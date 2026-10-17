import {
  appendPeriod,
  removePeriodAt,
  type TimetableData,
  updatePeriodAt,
} from '@gofor/core/timetable';

export interface TermSectionProps {
  data: TimetableData;
  update: (patch: (current: TimetableData) => TimetableData) => void;
}

/**
 * A. 学期与作息表。
 *
 * 只负责渲染与把改动交回外壳。「加一节 / 删一节怎么改数据」在 core 的 `edit.ts` 里：
 * 删一节要重新编号后面所有节次，那是纯逻辑、能单测，不该藏在 JSX 的内联表达式里。
 */
export function TermSection({ data, update }: TermSectionProps) {
  return (
    <>
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
                  update((current) => updatePeriodAt(current, index, { start: event.target.value }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <span className="opacity-30">—</span>
              <input
                type="time"
                value={period.end}
                onChange={(event) =>
                  update((current) => updatePeriodAt(current, index, { end: event.target.value }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <button
                type="button"
                onClick={() => update((current) => removePeriodAt(current, index))}
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
            update((current) => appendPeriod(current, { start: '18:30', end: '19:15' }))
          }
          className="text-xs opacity-50 hover:opacity-80"
        >
          + 加一节
        </button>
      </section>
    </>
  );
}
