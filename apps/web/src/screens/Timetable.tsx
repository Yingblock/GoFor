import { newId } from '@gofor/core';
import { dateKey, type Subject } from '@gofor/core/domain';
import {
  addRuleForCell,
  buildWeekGrid,
  defaultTimetable,
  mondayOf,
  occupiedCellKeys,
  parseTimetable,
  removeRule,
  type TimetableData,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import { CoursesSection } from './timetable/CoursesSection.tsx';
import { TermSection } from './timetable/TermSection.tsx';
import { WeekSection } from './timetable/WeekSection.tsx';

/** 与 App / 打印层共用同一个库内 id；P1 只有一个学期。 */
const TERM_ID = 'default';

/**
 * 离线·M2 课程表：外壳。
 *
 * 这里只做四件事：加载数据、持有草稿状态、把改动写回草稿、点保存落库。
 * 纯计算全部在 `@gofor/core/timetable`（连堂合并、周视图格子、增删规则、作息表增删改），
 * 渲染拆在 `./timetable/` 下的三个 section 里。拆之前这个文件 1100 行，
 * 里面一半是"改数据"的逻辑却没有一条测试。
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
  const [saved, setSaved] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const today = dateKey(appClock);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

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

  const update = useCallback((patch: (current: TimetableData) => TimetableData) => {
    setData((current) => (current ? patch(current) : current));
    setSaved(false);
  }, []);

  /**
   * 编辑模式点空格子：只排被点的那一天那一节。
   *
   * 写的是草稿（`data.rules`），**不自动保存**——用户仍要点「保存课表」，
   * 和页面上其它编辑行为一致，改坏了还能刷新走人。
   */
  const addRuleAt = useCallback(
    (courseId: string, day: number, periodIndex: number) => {
      update((current) => addRuleForCell(current, { id: newId(), courseId, day, periodIndex }));
    },
    [update],
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

  const save = useCallback(async () => {
    if (!data) return;
    // 只存课表自己的数据（学期/作息/规则/覆盖）；科目在 subjects 表里，不重复存。
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

  return (
    <div className="space-y-8">
      {warning ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}
        </p>
      ) : null}

      <TermSection data={data} update={update} />

      <CoursesSection
        data={data}
        subjects={subjects}
        subjectError={subjectError}
        subjectById={subjectById}
        update={update}
        onCreateSubject={handleCreateSubject}
        onRenameSubject={handleRenameSubject}
        onDeleteSubject={handleDeleteSubject}
      />

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
        onDeleteRule={removeRuleById}
      />

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
