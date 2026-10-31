import { type CourseNote, dateKey, type Subject } from '@gofor/core/domain';
import { occurrencesOn, parseTimetable } from '@gofor/domain/timetable';
import type { HomeBlockProps } from '@gofor/plugin-api';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '@gofor/plugin-kit';
import { type PluginStoreApi, pluginStore } from '@gofor/plugin-kit/store';
import { Card, EmptyState, Section } from '@gofor/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

const TIMETABLE_ID = 'default';
const LINK_ACTION = 'text-small opacity-40 transition-opacity duration-fast hover:opacity-70';

interface ScheduleEntry {
  time: string;
  end: string;
  label: string;
  courseId: string;
  startMinute: number;
  note: string;
}

function clockLabel(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`;
}

function ScheduleNoteInput({
  entry,
  date,
  store,
}: {
  entry: ScheduleEntry;
  date: string;
  store: PluginStoreApi;
}) {
  const [draft, setDraft] = useState(entry.note);
  useEffect(() => setDraft(entry.note), [entry.note]);

  const commit = () => {
    if (draft.trim() === entry.note.trim()) return;
    void store.saveCourseNote(
      {
        date,
        courseId: entry.courseId,
        startMinute: entry.startMinute,
        text: draft,
      },
      appClock.now(),
    );
  };

  return (
    <input
      value={draft}
      placeholder="备注"
      aria-label={`${entry.label} 备注`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      title={draft === '' ? '添加课程备注' : draft}
      className="min-w-16 max-w-full shrink rounded border-b border-line bg-transparent px-1 py-0.5 text-caption text-ellipsis outline-none transition-colors duration-fast placeholder:opacity-25 focus:border-accent [field-sizing:content]"
    />
  );
}

/** 首页「今日课表」块。课表/科目/备注都由课表插件自己取。 */
export function TimetableHomeBlock({ host }: HomeBlockProps) {
  const store = pluginStore(host.store);
  const today = dateKey(appClock);
  const timetable = useLiveQuery(() => store.loadTimetable(TIMETABLE_ID), [store], undefined);
  const subjects = useLiveQuery(() => store.listSubjects(), [store], [] as Subject[]);
  const allCourseNotes = useLiveQuery(
    () => store.listCourseNotes(today),
    [store, today],
    [] as CourseNote[],
  );

  const schedule = useMemo(() => {
    const data = parseTimetable(timetable);
    if (!data) return [] as ScheduleEntry[];
    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
    const courseNames = new Map(data.courses.map((course) => [course.id, course.name]));
    const notes = new Map<string, string>();
    for (const note of allCourseNotes) {
      notes.set(`${note.courseId}@${note.startMinute}`, note.text);
    }
    try {
      return occurrencesOn(today, data)
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((occurrence) => ({
          time: clockLabel(occurrence.startMinute),
          end: clockLabel(occurrence.endMinute),
          courseId: occurrence.courseId,
          startMinute: occurrence.startMinute,
          note: notes.get(`${occurrence.courseId}@${occurrence.startMinute}`) ?? '',
          label:
            subjectNames.get(occurrence.courseId) ??
            courseNames.get(occurrence.courseId) ??
            occurrence.courseId,
        }));
    } catch {
      return [] as ScheduleEntry[];
    }
  }, [allCourseNotes, subjects, timetable, today]);

  return (
    <Section
      title="今日课表"
      actions={
        <button
          type="button"
          onClick={() => host.navigate('gofor.timetable/screen')}
          className={LINK_ACTION}
        >
          去排课表 →
        </button>
      }
    >
      {schedule.length === 0 ? (
        <EmptyState>今天没有课</EmptyState>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-line">
            {schedule.map((entry) => (
              <li
                key={`${entry.time}-${entry.label}`}
                className="flex min-w-0 items-center gap-3 overflow-hidden px-4 py-2 text-body"
              >
                <span className="w-11 shrink-0 tabular-nums opacity-45">{entry.time}</span>
                <span className="min-w-16 flex-1 truncate">{entry.label}</span>
                <ScheduleNoteInput entry={entry} date={today} store={store} />
                <span className="shrink-0 text-caption tabular-nums opacity-30">– {entry.end}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}
