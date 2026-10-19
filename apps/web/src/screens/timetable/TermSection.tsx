import {
  appendPeriod,
  insertPeriodAt,
  movePeriod,
  removePeriodAt,
  type TimetableData,
  updatePeriodAt,
} from '@gofor/core/timetable';

/**
 * 「+ 加一节」与「在下方插入」共用同一组默认时间。
 *
 * 新插入的节次不该凭空出现在某个时间点：这组 18:30–19:15 沿用了「+ 加一节」
 * 的老默认值，用户插入后照着改两个时间就行。
 */
const NEW_PERIOD = { start: '18:30', end: '19:15' } as const;

export interface TermSectionProps {
  data: TimetableData;
  /** `validatePeriods` 的结果。非空时在顶部红字展示，外壳据此禁止自动保存。 */
  periodErrors: readonly string[];
  update: (patch: (current: TimetableData) => TimetableData) => void;
}

/**
 * A. 学期与作息表。
 *
 * 只负责渲染与把改动交回外壳。「加一节 / 删一节 / 插入 / 上移下移怎么改数据」
 * 在 core 的 `edit.ts` 里：它们都要重新编号后面所有节次，那是纯逻辑、能单测，
 * 不该藏在 JSX 的内联表达式里。
 *
 * 编号错乱、时间格式不对这类问题必须**当场**看得见（顶部红字）：
 * 外壳拿到同一份校验结果后会拒绝写库，否则坏作息一旦落库，
 * 下次启动周视图的行数/时间就全乱了。
 */
export function TermSection({ data, periodErrors, update }: TermSectionProps) {
  return (
    <>
      {/* A. 学期与作息表 */}
      <section className="space-y-3">
        {periodErrors.length > 0 ? (
          <ul className="space-y-0.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-small text-danger">
            {[...new Set(periodErrors)].map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}

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
            <li key={period.index} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-8 tabular-nums opacity-40">{period.index}</span>
              <input
                type="time"
                value={period.start}
                aria-label={`第 ${period.index} 节开始时间`}
                onChange={(event) =>
                  update((current) => updatePeriodAt(current, index, { start: event.target.value }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <span className="opacity-30">—</span>
              <input
                type="time"
                value={period.end}
                aria-label={`第 ${period.index} 节结束时间`}
                onChange={(event) =>
                  update((current) => updatePeriodAt(current, index, { end: event.target.value }))
                }
                className="rounded border border-black/10 bg-white/70 px-2 py-1"
              />
              <button
                type="button"
                aria-label={`上移第 ${period.index} 节`}
                title="上移"
                disabled={index === 0}
                onClick={() => update((current) => movePeriod(current, index, index - 1))}
                className="rounded-sm border border-line px-1.5 py-0.5 text-caption opacity-60 disabled:opacity-20"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`下移第 ${period.index} 节`}
                title="下移"
                disabled={index === data.periods.length - 1}
                onClick={() => update((current) => movePeriod(current, index, index + 1))}
                className="rounded-sm border border-line px-1.5 py-0.5 text-caption opacity-60 disabled:opacity-20"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`在第 ${period.index} 节下方插入`}
                onClick={() => update((current) => insertPeriodAt(current, index + 1, NEW_PERIOD))}
                className="text-caption opacity-40 hover:opacity-80"
              >
                在下方插入
              </button>
              <button
                type="button"
                onClick={() => update((current) => removePeriodAt(current, index))}
                className="text-caption opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => update((current) => appendPeriod(current, NEW_PERIOD))}
          className="text-small opacity-50 hover:opacity-80"
        >
          + 加一节
        </button>
      </section>
    </>
  );
}
