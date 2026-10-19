import type { Subject } from '@gofor/core/domain';
import {
  addDays,
  DAY_LABELS,
  mondayOf,
  type Occurrence,
  type TimetableData,
} from '@gofor/core/timetable';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { CourseLabel, UNKNOWN_SUBJECT_LABEL } from './CourseLabel.tsx';
import { type EditPopover, POPOVER_HEIGHT, POPOVER_WIDTH } from './types.ts';

export interface WeekSectionProps {
  data: TimetableData;
  weekStart: string;
  weekDates: string[];
  today: string;
  byDay: ReadonlyMap<string, Occurrence[]>;
  occupiedCells: ReadonlySet<string>;
  subjectById: ReadonlyMap<string, Subject>;
  subjects: Subject[];
  onWeekStartChange: (next: string) => void;
  /** 编辑模式点空格子：给这个科目在这一天这一节排一节课。 */
  onAddForCell: (courseId: string, day: number, periodIndex: number) => void;
  onDeleteRule: (ruleId: string) => void;
}

/**
 * C. 周视图 + 编辑模式浮层。
 *
 * 编辑状态、浮层位置、点外面关闭这些只在这一屏有用的状态都留在组件内部；
 * 数据的增删通过 `onAddForCell` / `onDeleteRule` 交回外壳——「改数据」只有一条路径，
 * 子组件也不直接碰 Dexie。
 */
export function WeekSection({
  data,
  weekStart,
  weekDates,
  today,
  byDay,
  occupiedCells,
  subjectById,
  subjects,
  onWeekStartChange,
  onAddForCell,
  onDeleteRule,
}: WeekSectionProps) {
  /** 编辑模式默认关闭：课表首先是"看"的，改是偶发动作。 */
  const [editing, setEditing] = useState(false);
  const [popover, setPopover] = useState<EditPopover | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const gridHostRef = useRef<HTMLDivElement | null>(null);

  const setWeekStart = onWeekStartChange;

  const cellBorderClass = editing
    ? 'border-b border-l border-dashed border-line-strong'
    : 'border-b border-line border-l border-line';
  const gridFrameClass = editing
    ? 'border-dashed border-line-strong bg-card-soft'
    : 'border-line bg-card-faint';

  const courseLabel = (id: string): string => subjectById.get(id)?.name ?? UNKNOWN_SUBJECT_LABEL;

  const addRuleForSubject = (subject: Subject, day: number, periodIndex: number) => {
    onAddForCell(subject.id, day, periodIndex);
    setPopover(null);
  };

  const removeRule = (ruleId: string) => {
    onDeleteRule(ruleId);
    setPopover(null);
  };

  /** 把浮层贴在格子左下角；下方放不下就翻到上面，横向不越界。 */
  const anchorOf = (element: HTMLElement): { x: number; y: number } => {
    const host = gridHostRef.current;
    if (host === null) return { x: 0, y: 0 };
    const hostRect = host.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.left - hostRect.left, hostRect.width - POPOVER_WIDTH));
    const below = rect.bottom - hostRect.top;
    const above = rect.top - hostRect.top - POPOVER_HEIGHT;
    return { x, y: below + POPOVER_HEIGHT > hostRect.height ? Math.max(0, above) : below };
  };

  const openAddPopover = (
    event: ReactMouseEvent<HTMLButtonElement>,
    day: number,
    periodIndex: number,
  ) => {
    setPopover({ kind: 'add', day, periodIndex, ...anchorOf(event.currentTarget) });
  };

  const openDeletePopover = (event: ReactMouseEvent<HTMLButtonElement>, occurrence: Occurrence) => {
    setPopover({
      kind: 'delete',
      ruleId: occurrence.ruleId,
      courseId: occurrence.courseId,
      startPeriod: occurrence.startPeriod,
      span: occurrence.span,
      ...anchorOf(event.currentTarget),
    });
  };

  /**
   * 点浮层外面就关掉它。用 pointerdown 而不是 click：pointerdown 更早，
   * 关掉浮层后这一次点击不会再落到被浮层盖住的格子上（否则关一次顺手又开一个）。
   */
  useEffect(() => {
    if (popover === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      setPopover(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [popover]);

  return (
    <>
      {/* C. 周视图 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border border-line px-2 py-1 text-xs opacity-60"
          >
            ← 上一周
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(today))}
            className="rounded border border-line px-2 py-1 text-xs opacity-60"
          >
            本周
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border border-line px-2 py-1 text-xs opacity-60"
          >
            下一周 →
          </button>
          <span className="text-xs tabular-nums opacity-45">
            {weekDates[0]} ~ {weekDates[6]}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing((current) => !current);
              // 退出编辑时顺手关掉浮层：否则它会留在只读界面上，
              // 里面的"删除这节"还能点，等于绕过编辑模式改数据。
              setPopover(null);
            }}
            aria-pressed={editing}
            className={`ml-auto rounded border px-2 py-1 text-xs ${
              editing
                ? 'border-[var(--color-strong)] bg-[var(--color-strong)] text-on-strong'
                : 'border-line opacity-60'
            }`}
          >
            {editing ? '退出编辑' : '编辑模式'}
          </button>
        </div>

        {editing ? <p className="text-[11px] opacity-45">点空白格子加课，点课程块删除</p> : null}

        <div ref={gridHostRef} className="relative">
          {/* 浮层用的是"相对容器"的静态坐标，横向滚动后会和格子错位；
              滚动（滚轮/拖滚动条）不触发 pointerdown，所以这里单独关一次浮层。 */}
          <div
            className={`overflow-x-auto rounded-xl border ${gridFrameClass}`}
            data-testid="week-grid"
            onScroll={() => setPopover(null)}
          >
            <div
              className="grid min-w-[640px] text-[11px]"
              style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}
            >
              <div className="border-b border-line p-1.5" />
              {weekDates.map((date, index) => (
                <div
                  key={date}
                  className={`border-b border-l border-line p-1.5 text-center ${
                    date === today ? 'bg-overlay font-medium' : 'opacity-60'
                  }`}
                >
                  {DAY_LABELS[index]}
                  <span className="ml-1 opacity-50">{date.slice(5)}</span>
                </div>
              ))}

              {/* 基础网格：节次列 */}
              {data.periods.map((period, row) => (
                <div
                  key={`label-${period.index}`}
                  className={`h-10 px-1 py-0.5 tabular-nums ${cellBorderClass}`}
                  style={{ gridColumn: 1, gridRow: row + 2 }}
                >
                  <span className="opacity-35">
                    {period.index}
                    <span className="ml-1 opacity-70">{period.start}</span>
                  </span>
                </div>
              ))}

              {/* 基础网格：日期列。编辑模式下只有空格子长成按钮，
                  有课的格子保持纯底色——课程块叠在上面，两个都要能点只会互相抢事件。 */}
              {data.periods.map((period, row) =>
                weekDates.map((date, column) => {
                  const style: CSSProperties = { gridColumn: column + 2, gridRow: row + 2 };
                  const cellClass = `h-10 px-1 py-0.5 tabular-nums ${cellBorderClass}`;
                  const key = `${period.index}-${column}`;
                  if (!editing || occupiedCells.has(`${date}#${period.index}`)) {
                    return <div key={key} className={cellClass} style={style} />;
                  }
                  // weekDates 从周一开始，所以列序正好是星期几（1=周一 … 7=周日）。
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(event) => openAddPopover(event, column + 1, period.index)}
                      className={`${cellClass} cursor-pointer bg-overlay text-left hover:bg-overlay`}
                      style={style}
                      aria-label={`${DAY_LABELS[column]} 第 ${period.index} 节加课`}
                    />
                  );
                }),
              )}

              {/* 课程块叠在网格上。查看模式是只读 div，编辑模式换成 button：
                  只有真按钮才有 Tab 停靠点和键盘激活，删除入口不能只靠鼠标。 */}
              {weekDates.flatMap((date, column) =>
                (byDay.get(date) ?? []).map((occurrence) => {
                  const style: CSSProperties = {
                    gridColumn: column + 2,
                    gridRow: `${occurrence.startPeriod + 1} / span ${occurrence.span}`,
                  };
                  const title = `${courseLabel(occurrence.courseId)} ${occurrence.startMinute}-${occurrence.endMinute}`;
                  const blockClass = `m-0.5 overflow-hidden rounded bg-[var(--color-strong)]/85 px-1.5 py-1 text-left text-on-strong ${
                    editing ? 'cursor-pointer ring-1 ring-line-strong hover:brightness-110' : ''
                  }`;
                  const label = (
                    <CourseLabel
                      id={occurrence.courseId}
                      lookup={subjectById}
                      unknownClassName="text-on-strong/60"
                    />
                  );
                  if (!editing) {
                    return (
                      <div key={occurrence.key} className={blockClass} style={style} title={title}>
                        {label}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={occurrence.key}
                      type="button"
                      onClick={(event) => openDeletePopover(event, occurrence)}
                      className={blockClass}
                      style={style}
                      title={`${title}（点击删除）`}
                    >
                      {label}
                    </button>
                  );
                }),
              )}
            </div>
          </div>

          {/* 浮层放在滚动容器外面：格子可以横向滚动，浮层不能被裁成半截。 */}
          {popover === null ? null : (
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="编辑格子"
              className="absolute z-20 w-56 rounded-xl border border-line bg-card p-2 text-xs shadow-lg"
              style={{ left: popover.x, top: popover.y }}
            >
              {popover.kind === 'add' ? (
                <>
                  <p className="px-1 pb-1 text-[11px] tabular-nums opacity-50">
                    {DAY_LABELS[popover.day - 1]} 第 {popover.periodIndex} 节
                  </p>
                  {subjects.length === 0 ? (
                    <p className="px-1 py-1 text-[11px] leading-relaxed opacity-50">
                      还没有科目，先在「科目」里加一门。
                    </p>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto">
                      {subjects.map((subject) => (
                        <li key={subject.id}>
                          <button
                            type="button"
                            onClick={() =>
                              void addRuleForSubject(subject, popover.day, popover.periodIndex)
                            }
                            className="w-full rounded px-2 py-1 text-left hover:bg-overlay"
                          >
                            {subject.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="px-1 pb-1 text-[11px] tabular-nums opacity-50">
                    {courseLabel(popover.courseId)} · 第 {popover.startPeriod} 节起
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRule(popover.ruleId)}
                    className="w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-50"
                  >
                    删除这节
                  </button>
                  <p className="px-1 pt-1 text-[11px] leading-relaxed opacity-40">
                    会删掉产生它的那条规则（这条规则排的其它天也一起消失）。
                    {popover.span > 1 ? '连堂块只删第一条规则，剩下的会变回单独的块。' : ''}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
