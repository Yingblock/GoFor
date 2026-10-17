import { newId, systemClock } from '@gofor/core';
import { dateKey, type Subject } from '@gofor/core/domain';
import {
  mergeAdjacent,
  type Occurrence,
  occurrencesOn,
  type Rule,
  type Term,
  type TimetableData,
} from '@gofor/core/timetable';
import {
  createSubject,
  db,
  deleteSubject,
  listSubjects,
  loadTimetable,
  renameSubject,
  saveTimetable,
} from '@gofor/store';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const TERM_ID = 'default';

/** 科目被删掉后，规则里指向它的 courseId 只剩一个"没有名字的 id"。 */
const UNKNOWN_SUBJECT_LABEL = '未知科目（已删除）';

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

/**
 * 浮层的宽/高估算值是**只用来防止浮层超出网格容器**的，不参与布局计算。
 * 为什么允许估算：真正的宽度由 CSS 决定，这里只需要一个"大概占多大"的下界，
 * 宁可估大一点（把浮层往回收一点），也不要让它被容器裁掉。
 */
const POPOVER_WIDTH = 224;
const POPOVER_HEIGHT = 260;

/**
 * 编辑模式下点格子弹出的小浮层。
 *
 * - `add`：空格子 → 列科目，选一个就生成一条规则；
 * - `delete`：有课的块 → 删掉产生它的那条规则。
 *
 * `x`/`y` 是相对网格容器的绝对定位坐标，在打开浮层时算一次并存进 state；
 * 放到渲染期再读 DOM 会让每次重渲染都触发读写布局抖动，也让组件不再可预测。
 */
type EditPopover =
  | { kind: 'add'; day: number; periodIndex: number; x: number; y: number }
  | {
      kind: 'delete';
      ruleId: string;
      courseId: string;
      startPeriod: number;
      span: number;
      x: number;
      y: number;
    };

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
    // 旧版课表自带一份 courses；现在科目统一走 Dexie 的 subjects 表。
    // 字段留着只是因为 TimetableData 的类型定义还在用，页面不再读也不再写它。
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
  // `courses` 已经是历史字段，但旧数据里仍然有；只做"存在且是数组"的兼容检查，
  // 不因为它是空数组就判定数据损坏。
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

/**
 * 离线·M2 课程表：科目 + 规则录入 + 周视图。
 *
 * **科目只存一份**：课表不再维护自己的 `TimetableData.courses`，而是直接读写
 * Dexie 的 `subjects` 表（番茄钟、作业也用这张表）。
 * 为什么：两套科目必然漂移——课表里加的科目番茄钟看不到，改个名还得两处同步；
 * 规则里只存 `courseId = subject.id`，改名只改 subjects 一行，所有引用自动跟着变。
 * 代价是删科目不能级联删规则，否则就是静默的数据丢失，所以删除走行内二次确认。
 *
 * 旧数据的 `courseId` 是旧版自建课程的 id，在 subjects 里查不到；
 * 那种情况按「未知科目（已删除）」降级显示，不崩、也不偷偷改用户的规则。
 */
export function TimetableScreen() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(mondayOf(dateKey(systemClock)));
  const [saved, setSaved] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  /** 编辑模式默认关闭：课表首先是"看"的，改是偶发动作。 */
  const [editing, setEditing] = useState(false);
  const [popover, setPopover] = useState<EditPopover | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const gridHostRef = useRef<HTMLDivElement | null>(null);

  /** 科目是全局数据，每次写完都重新拉一遍，保证改名/删除立刻反映到规则和周视图。 */
  const refreshSubjects = useCallback(async () => {
    setSubjects(await listSubjects(db));
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshSubjects();
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
  }, [refreshSubjects]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const today = dateKey(systemClock);

  const byDay = useMemo(() => {
    if (!data) return new Map<string, Occurrence[]>();
    // 先合并再渲染：用户把数学排成第 2、3 节两条规则时，屏幕上应该是一整块连堂，
    // 而不是两个方块。合并放在 core（mergeAdjacent）而不是这里手写，
    // 是因为"什么算连堂"是课表语义；这里只负责把结果摆到格子上。
    return new Map(weekDates.map((date) => [date, mergeAdjacent(occurrencesOn(date, data))]));
  }, [data, weekDates]);

  /**
   * 编辑模式下哪些"日期 + 节次"格子已经有课。
   * 用合并后的结果算：一个连堂块占了 span 行，这几行都该算"有课"，
   * 否则连堂块下面的格子还能点开"加课"浮层，排出时间重叠的规则。
   */
  const occupiedCells = useMemo(() => {
    const cells = new Set<string>();
    for (const [date, occurrences] of byDay) {
      for (const occurrence of occurrences) {
        for (let offset = 0; offset < occurrence.span; offset += 1) {
          cells.add(`${date}#${occurrence.startPeriod + offset}`);
        }
      }
    }
    return cells;
  }, [byDay]);

  /** courseId → 科目。用 Map 是因为规则列表和周视图每帧都要查几十次。 */
  const subjectById = useMemo(
    () => new Map<string, Subject>(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );

  const update = useCallback((patch: (current: TimetableData) => TimetableData) => {
    setData((current) => (current ? patch(current) : current));
    setSaved(false);
  }, []);

  /**
   * 点浮层外面就关掉它。
   *
   * 用 `pointerdown` 而不是 `click`：pointerdown 比 click 早，关掉浮层后
   * 这一次点击不会再落到"浮层覆盖的下层格子"上，避免关一次浮层顺手又打开一个新的。
   * 监听挂在 document 上（而不是浮层的父元素），因为浮层是绝对定位、可能盖住邻居格子。
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

  /**
   * 把浮层贴在格子的左下角。
   *
   * 浮层是网格容器的绝对定位子元素（不是滚动容器的子元素），所以坐标取
   * "相对容器左上角的可视偏移"——横向滚动后 rect 已经反映了当前位置，不用再加 scrollLeft。
   * 下方放不下就翻到格子上面，右侧放不下就往回收，窄屏下也不会跑到页面外。
   */
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
   * 在空格子上补一条规则。
   *
   * 只排被点的那一天那一节：想连排几天就多点几个格子，比让用户回到上面
   * 再填"星期几 / 第几节"直观得多。写的是 `data.rules`，**不自动保存**，
   * 用户仍要点「保存课表」——和页面上其它编辑行为保持一致，改坏了还能刷新走人。
   */
  const addRuleForSubject = useCallback(
    (subject: Subject, day: number, periodIndex: number) => {
      update((current) => ({
        ...current,
        rules: [
          ...current.rules,
          {
            id: newId(),
            // courseId 指向 subjects 表的科目，和番茄钟/作业共用同一份科目。
            courseId: subject.id,
            byDay: [day],
            startPeriod: periodIndex,
            span: 1,
            intervalWeeks: 1,
          },
        ],
      }));
      setPopover(null);
    },
    [update],
  );

  /**
   * 删掉产生这一块的规则。
   *
   * 取舍：连堂块是 mergeAdjacent 把多条规则的课并成一条的，块上只留下第一条规则的 ruleId，
   * 所以删"这一节"只会去掉第一条规则，剩下的半截会立刻变回单独的块——
   * 这比"猜用户想删整块"更安全：那需要把合并前的所有 ruleId 都带上，
   * 而多删规则是不可撤销的数据丢失。要删干净就再点一次剩下的那块。
   * 另外一条规则可能排了多个星期几，删规则会连带删掉它在别的那几天的课，浮层里已写明。
   */
  const removeRule = useCallback(
    (ruleId: string) => {
      update((current) => ({
        ...current,
        rules: current.rules.filter((rule) => rule.id !== ruleId),
      }));
      setPopover(null);
    },
    [update],
  );

  const save = useCallback(async () => {
    if (!data) return;
    // 只存课表自己的数据（学期/作息/规则/覆盖）；科目在 subjects 表里，不在这里重复存一份。
    await saveTimetable(db, TERM_ID, data, Date.now());
    setSaved(true);
    setWarning(null);
  }, [data]);

  /** 科目写操作统一收口：失败提示 + 成功后刷新，避免三处各写一遍 try/catch。 */
  const runSubjectWrite = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refreshSubjects();
        setSubjectError(null);
      } catch {
        setSubjectError('科目没保存成功，请再试一次。');
      }
    },
    [refreshSubjects],
  );

  const handleCreateSubject = useCallback(
    async (name: string) => runSubjectWrite(() => createSubject(db, name)),
    [runSubjectWrite],
  );

  const handleRenameSubject = useCallback(
    async (id: string, name: string) => runSubjectWrite(() => renameSubject(db, id, name)),
    [runSubjectWrite],
  );

  const handleDeleteSubject = useCallback(
    async (id: string) => runSubjectWrite(() => deleteSubject(db, id)),
    [runSubjectWrite],
  );

  if (!data) {
    return <div className="text-sm opacity-50">加载课表…</div>;
  }

  const periodCount = data.periods.length;

  /**
   * 网格线。编辑模式下换成虚线：不用额外说明也能看出"这张表现在可以点"。
   * 关闭时保持原来的两档灰度（横线更浅、竖线稍深），视觉上和以前完全一致。
   */
  const cellBorderClass = editing
    ? 'border-b border-l border-dashed border-black/20'
    : 'border-b border-black/[0.04] border-l border-black/[0.06]';

  /** 网格容器的外框：编辑模式虚线 + 更亮的底色，关闭时保持原来的浅灰边框。 */
  const gridFrameClass = editing
    ? 'border-dashed border-black/25 bg-white/70'
    : 'border-black/[0.08] bg-white/50';

  /** 查不到名字返回 null（科目被删/旧数据），由展示层决定怎么降级。 */
  const courseName = (id: string): string | null => subjectById.get(id)?.name ?? null;
  /** 给 aria-label / title 用的一句话名称。 */
  const courseLabel = (id: string): string => courseName(id) ?? UNKNOWN_SUBJECT_LABEL;

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
        <div className="flex flex-wrap items-center gap-2">
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
                ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-white'
                : 'border-black/10 opacity-60'
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
                      className={`${cellClass} cursor-pointer bg-black/[0.015] text-left hover:bg-black/[0.06]`}
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
                  const blockClass = `m-0.5 overflow-hidden rounded bg-[var(--color-ink)]/85 px-1.5 py-1 text-left text-white ${
                    editing ? 'cursor-pointer ring-1 ring-white/40 hover:brightness-110' : ''
                  }`;
                  const label = (
                    <CourseLabel
                      id={occurrence.courseId}
                      lookup={subjectById}
                      unknownClassName="text-white/60"
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
              className="absolute z-20 w-56 rounded-xl border border-black/10 bg-white p-2 text-xs shadow-lg"
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
                            className="w-full rounded px-2 py-1 text-left hover:bg-black/[0.06]"
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

/**
 * 科目名展示。
 *
 * 查不到就降级成灰字「未知科目（已删除）」：旧数据的 courseId 指向旧版课程表，
 * 或者科目刚被删，都走这条路。绝不因为查不到就渲染 `?` 或直接崩。
 */
function CourseLabel({
  id,
  lookup,
  unknownClassName = 'italic text-black/40',
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

/**
 * 科目管理：新增 / 改名 / 删除。
 *
 * 所有写操作都直接落 `subjects` 表，并立即刷新列表；
 * 课表规则只存科目 id，所以改名不需要碰任何规则。
 * 删除不级联清规则（那是静默丢数据），改为行内二次确认 + 明确后果说明。
 */
function SubjectManager({
  subjects,
  onCreate,
  onRename,
  onDelete,
}: {
  subjects: Subject[];
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const submitDraft = () => {
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    void onCreate(name);
  };

  const submitRename = (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setEditingId(null);
    setEditingName('');
    void onRename(id, name);
  };

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
        {subjects.length === 0 ? (
          <li className="px-3 py-2 text-xs opacity-40">还没有科目，在下面加一个，比如「数学」。</li>
        ) : null}
        {subjects.map((subject) => {
          const editing = editingId === subject.id;
          const confirming = pendingDeleteId === subject.id;
          return (
            <li key={subject.id} className="px-3 py-2 text-xs">
              {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setEditingId(null);
                        return;
                      }
                      if (event.key === 'Enter') submitRename(subject.id);
                    }}
                    aria-label={`${subject.name} 的新名称`}
                    className="w-40 rounded border border-black/10 bg-white/70 px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => submitRename(subject.id)}
                    className="rounded-lg bg-[var(--color-ink)] px-3 py-1 text-white"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-black/10 px-3 py-1"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{subject.name}</span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDeleteId(null);
                      setEditingId(subject.id);
                      setEditingName(subject.name);
                    }}
                    className="text-[11px] opacity-40 hover:opacity-70"
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(confirming ? null : subject.id)}
                    className="text-[11px] opacity-40 hover:text-red-500 hover:opacity-90"
                  >
                    删除
                  </button>
                </div>
              )}

              {confirming ? (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  <p>
                    已排的规则不会自动清除，会显示为「未知科目（已删除）」，需要你到下面自己删规则。
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDeleteId(null);
                        void onDelete(subject.id);
                      }}
                      className="rounded bg-amber-600 px-2 py-1 text-white"
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="rounded border border-amber-400 px-2 py-1"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitDraft();
          }}
          placeholder="科目名，如 数学"
          aria-label="新科目名"
          className="w-40 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs outline-none"
        />
        <button
          type="button"
          onClick={submitDraft}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
        >
          加科目
        </button>
      </div>
    </div>
  );
}

function RuleAdder({
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
