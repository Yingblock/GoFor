import { newId, type TimerHandle } from '@gofor/core';
import { dateKey, type Subject } from '@gofor/core/domain';
import {
  addRuleForCell,
  buildWeekGrid,
  defaultTimetable,
  mondayOf,
  occupiedCellKeys,
  parseTimetable,
  removeRule,
  replaceCourseForBlock,
  type TimetableData,
  validatePeriods,
  validateRules,
  weekDatesOf,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import { CoursesSection } from './timetable/CoursesSection.tsx';
import { TermSection } from './timetable/TermSection.tsx';
import { WeekSection } from './timetable/WeekSection.tsx';

/** 与 App / 打印层共用同一个库内 id；P1 只有一个学期。 */
const TERM_ID = 'default';

/** 自动保存的防抖时长：改完停手 600ms 就写库，连续输入只写最后一次。 */
const AUTOSAVE_DELAY_MS = 600;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

/**
 * 会拦住自动保存的校验错误。
 *
 * 空数组才是"可以落库"：坏作息/坏规则一旦写进去，下次启动周视图的行数、时间、
 * 连堂范围就全乱了。两个校验都在 core 里，能单测，组件只负责展示。
 */
function collectErrors(data: TimetableData): string[] {
  return [...validatePeriods(data.periods), ...validateRules(data)];
}

/** 写库失败的提示文案；Dexie 的错误带 message，未知异常给个兜底。 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return '未知错误';
}

/** 状态条上的 `HH:mm`（自动保存时间）。 */
function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 离线·M2 课程表：外壳。
 *
 * 这里只做四件事：加载数据、持有草稿状态、把改动写回草稿、防抖自动保存。
 * 纯计算全部在 `@gofor/core/timetable`（连堂合并、周视图格子、增删规则、作息表增删改、
 * 插入/上下移动、校验），渲染拆在 `./timetable/` 下的三个 section 里。
 *
 * **自动保存**：任何改动后 600ms 防抖写库（防抖用的也是注入时钟，不裸写 setTimeout）。
 * 有校验错误时不写库、状态条显示「有错误未保存」，错误详情由各 section 红字列出。
 * 离开页面时若还有没落库的改动，卸载时立刻补写一次（fire-and-forget）。
 * 「立即保存」按钮只是兜底，正常流程不需要点。
 *
 * **科目只存一份**：课表不维护自己的 `courses`，而是直接读写 Dexie 的 `subjects` 表
 * （番茄钟、作业也用这张表）。规则里只存 `courseId = subject.id`，改名只改一行。
 * 删科目不级联删规则（那是静默丢数据），改为行内二次确认 + 明确后果说明；
 * 旧数据的 courseId 查不到时降级显示「未知科目（已删除）」，不崩、也不偷改规则。
 */
export function TimetableScreen() {
  const [data, setData] = useState<TimetableData | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [warning, setWarning] = useState<string | null>(null);

  const today = dateKey(appClock);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

  // 自动保存靠 ref 读"最新数据"：定时器回调与卸载 flush 都不该被闭包里的旧快照绑住。
  const dataRef = useRef<TimetableData | null>(null);
  const timerRef = useRef<TimerHandle | null>(null);
  const saveNowRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  /** 有没落库的改动。 */
  const dirtyRef = useRef(false);
  /** 每次改动自增；保存完成时用它判断"期间有没有新改动"。 */
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** 科目是全局数据，每次写完都重新拉一遍，保证改名/删除立刻反映到规则和周视图。 */
  const refreshSubjects = useCallback(async () => {
    setSubjects(await listSubjects(db));
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshSubjects();
      const raw = await loadTimetable(db, TERM_ID);
      if (raw === undefined) {
        setData(defaultTimetable(TERM_ID, dateKey(appClock)));
        return;
      }
      // 解析规则在 core（`parseTimetable`）：缺几个历史字段就补空，不整份判废，
      // 只有"没有节次 / 学期日期非法"这种真渲染不了的才回退默认。
      const parsed = parseTimetable(raw);
      if (parsed) {
        setData(parsed);
      } else {
        setWarning('本地课表数据不完整，已载入默认作息；确认后点保存覆盖。');
        setData(defaultTimetable(TERM_ID, dateKey(appClock)));
      }
    })();
  }, [refreshSubjects]);

  const weekDates = useMemo(() => weekDatesOf(weekStart), [weekStart]);

  /** 先合并连堂再渲染：第 2、3 节两条规则在屏幕上应该是一整块。 */
  const byDay = useMemo(
    () => (data ? buildWeekGrid(weekDates, data) : new Map()),
    [data, weekDates],
  );

  /** 编辑模式下"已经有课"的格子：连堂块跨的每一行都算，避免排出重叠规则。 */
  const occupiedCells = useMemo(() => occupiedCellKeys(byDay), [byDay]);

  const subjectById = useMemo(
    () => new Map<string, Subject>(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );

  /** 校验结果同时用于红字展示和自动保存闸门；错误为空才允许写库。 */
  const periodErrors = useMemo(() => (data ? validatePeriods(data.periods) : []), [data]);
  const ruleErrors = useMemo(() => (data ? validateRules(data) : []), [data]);
  const errorCount = periodErrors.length + ruleErrors.length;

  const scheduleAutoSave = useCallback(() => {
    if (timerRef.current !== null) appClock.clearTimeout(timerRef.current);
    timerRef.current = appClock.setTimeout(() => {
      timerRef.current = null;
      void saveNowRef.current();
    }, AUTOSAVE_DELAY_MS);
  }, []);

  const saveNow = useCallback(
    async (force = false) => {
      // 手动保存也走这里：先撤掉待触发的防抖，避免刚写完又写一遍。
      if (timerRef.current !== null) {
        appClock.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = dataRef.current;
      if (current === null || savingRef.current) return;
      if (!force && !dirtyRef.current) return;
      if (collectErrors(current).length > 0) return; // 有错不写库；状态条已显示「有错误未保存」

      const revision = revisionRef.current;
      savingRef.current = true;
      setSaveState({ kind: 'saving' });
      try {
        const now = appClock.now();
        await saveTimetable(db, TERM_ID, current, now);
        if (!aliveRef.current) return;
        // 保存期间又改过：dirty 保持 true，那次改动已经排了新的防抖，由它再写一次。
        if (revisionRef.current === revision) {
          dirtyRef.current = false;
          setSaveState({ kind: 'saved', at: now });
          setWarning(null);
        }
      } catch (error) {
        if (!aliveRef.current) return;
        setSaveState({ kind: 'error', message: describeError(error) });
      } finally {
        savingRef.current = false;
        // 保存期间来的改动可能已经触发过防抖、但因为 savingRef 提前返回了；这里补排一次，
        // 否则那条改动会一直停在 dirty 状态，直到用户下一次编辑。
        if (
          aliveRef.current &&
          dirtyRef.current &&
          revisionRef.current !== revision &&
          timerRef.current === null
        ) {
          scheduleAutoSave();
        }
      }
    },
    [scheduleAutoSave],
  );
  saveNowRef.current = saveNow;

  /**
   * 编辑模式点空格子：只排被点的那一天那一节。
   *
   * 写的是草稿（`data.rules`），由防抖自动保存落库；这里不再要求用户点保存。
   */
  const update = useCallback(
    (patch: (current: TimetableData) => TimetableData) => {
      setData((current) => (current ? patch(current) : current));
      revisionRef.current += 1;
      dirtyRef.current = true;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  /**
   * 删掉产生这一块的规则。
   *
   * 取舍：连堂块只记着第一条规则的 id，所以删"这一节"只删第一条，剩下的半截
   * 会变回单独的块。宁可少删，也不要多删——多删不可撤销。
   */
  const removeRuleById = useCallback(
    (ruleId: string) => update((current) => removeRule(current, ruleId)),
    [update],
  );

  const addRuleAt = useCallback(
    (courseId: string, day: number, periodIndex: number) => {
      update((current) => addRuleForCell(current, { id: newId(), courseId, day, periodIndex }));
    },
    [update],
  );

  /**
   * 编辑模式点课程块换课：只换科目，不动时间与节次。
   *
   * 展开/圈定规则在 core 的 `replaceCourseForBlock`：连堂块可能由多条规则拼成，
   * 也可能被 Override 挪过位置，只有先展开才能把这一块背后的规则找齐。
   */
  const replaceCourseAt = useCallback(
    (input: { date: string; startPeriod: number; span: number; courseId: string }) => {
      update((current) => replaceCourseForBlock(current, input));
    },
    [update],
  );

  /**
   * 卸载时把没落库的改动写掉。
   *
   * 防抖窗口是 600ms：用户改完立刻切页，定时器还没触发，不能因为"没点保存"就丢改动。
   * 这里不 await（组件已经要卸载了），失败也只能放弃——下次进来读到的还是旧数据，
   * 但至少不会把页面卸载卡住。
   */
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) {
        appClock.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = dataRef.current;
      if (current === null || !dirtyRef.current) return;
      if (collectErrors(current).length > 0) return;
      dirtyRef.current = false;
      void saveTimetable(db, TERM_ID, current, appClock.now()).catch(() => {
        // 已经离开页面，没地方展示错误；不要让未处理的 rejection 冒到控制台以外。
      });
    };
  }, []);

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

  const handleManualSave = useCallback(() => {
    void saveNow(true);
  }, [saveNow]);

  if (!data) {
    return <div className="text-sm opacity-50">加载课表…</div>;
  }

  const statusText =
    errorCount > 0
      ? '有错误未保存'
      : saveState.kind === 'saving'
        ? '正在保存…'
        : saveState.kind === 'saved'
          ? `已自动保存 ${formatClock(saveState.at)}`
          : saveState.kind === 'error'
            ? `保存失败：${saveState.message}`
            : '';

  const statusClass =
    errorCount > 0 || saveState.kind === 'error'
      ? 'text-small text-danger'
      : saveState.kind === 'saved'
        ? 'text-small text-ok'
        : 'text-small text-muted';

  return (
    <div className="space-y-8">
      {warning ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}
        </p>
      ) : null}

      {/* 保存状态放最上面：周视图和规则列表都长，反馈必须一眼看得到。 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleManualSave}
          className="rounded-lg bg-[var(--color-strong)] px-4 py-2 text-sm text-on-strong"
        >
          立即保存
        </button>
        <span role="status" aria-live="polite" className={statusClass}>
          {statusText === '' ? '改动后会自动保存' : statusText}
        </span>
      </div>

      {/* 顺序：A 学期作息表 → C 周视图 → B 课程与规则。
          周视图在规则之上，规则再多也不会把表格淹掉。 */}
      <TermSection data={data} periodErrors={periodErrors} update={update} />

      <WeekSection
        data={data}
        weekStart={weekStart}
        weekDates={weekDates}
        today={today}
        byDay={byDay}
        occupiedCells={occupiedCells}
        subjectById={subjectById}
        subjects={subjects}
        onWeekStartChange={setWeekStart}
        onAddForCell={addRuleAt}
        onReplaceCourse={replaceCourseAt}
        onDeleteRule={removeRuleById}
      />

      <CoursesSection
        data={data}
        subjects={subjects}
        subjectError={subjectError}
        ruleErrors={ruleErrors}
        subjectById={subjectById}
        update={update}
        onCreateSubject={handleCreateSubject}
        onRenameSubject={handleRenameSubject}
        onDeleteSubject={handleDeleteSubject}
      />
    </div>
  );
}
