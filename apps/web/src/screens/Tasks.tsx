import { newId } from '@gofor/core';
import { normalizeTask, type Subject, type Task } from '@gofor/core/domain';
import {
  createTask,
  db,
  deleteTask,
  ensureSubjects,
  listSubjects,
  setTaskDone,
  updateTask,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** 交换相邻两条任务的 sortKey，实现"上移/下移"。 */
async function moveTask(tasks: Task[], index: number, delta: -1 | 1, now: number): Promise<void> {
  const target = index + delta;
  if (target < 0 || target >= tasks.length) return;
  const current = tasks[index];
  const other = tasks[target];
  if (!current || !other) return;

  await updateTask(db, current.id, { sortKey: other.sortKey }, now);
  await updateTask(db, other.id, { sortKey: current.sortKey }, now);
}

/** P1·M2 作业清单：截止时间、必做/选做、子任务、排序。 */
export function Tasks({ tasks }: { tasks: Task[] }) {
  const [draft, setDraft] = useState('');
  const [optional, setOptional] = useState(false);
  const [due, setDue] = useState('');

  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);

  useEffect(() => {
    void ensureSubjects(db);
  }, []);

  const normalized = useMemo(() => tasks.map(normalizeTask), [tasks]);

  const add = useCallback(async () => {
    const title = draft.trim();
    if (title === '') return;
    const task = await createTask(db, {
      id: newId(),
      title,
      due: due === '' ? null : due,
      now: Date.now(),
    });
    if (optional) await updateTask(db, task.id, { optional: true }, Date.now());
    setDraft('');
    setOptional(false);
  }, [draft, due, optional]);

  const addSubtask = useCallback(async (task: ReturnType<typeof normalizeTask>) => {
    const title = window.prompt('子任务：')?.trim();
    if (!title) return;
    await updateTask(
      db,
      task.id,
      { subtasks: [...task.subtasks, { id: newId(), title, done: false }] },
      Date.now(),
    );
  }, []);

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl border border-black/[0.08] bg-white/50 p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add();
            }}
            placeholder="加一项作业，回车确认"
            className="flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void add()}
            className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
          >
            添加
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs opacity-70">
          <label className="flex items-center gap-1.5">
            <span>截止</span>
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              className="rounded border border-black/10 bg-white/70 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={optional}
              onChange={(event) => setOptional(event.target.checked)}
            />
            <span>选做</span>
          </label>
        </div>
      </div>

      {normalized.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-10 text-center text-xs opacity-40">
          还没有作业
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
          {normalized.map((task, index) => {
            const subject = subjects.find((item) => item.id === task.subjectId);
            const doneSubtasks = task.subtasks.filter((item) => item.done).length;

            return (
              <li key={task.id} className="group px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`完成 ${task.title}`}
                    checked={task.done}
                    onChange={(event) =>
                      void setTaskDone(db, task.id, event.target.checked, Date.now())
                    }
                    className="size-4 shrink-0"
                  />
                  <span className={`flex-1 text-sm ${task.done ? 'line-through opacity-40' : ''}`}>
                    {task.title}
                  </span>

                  {task.optional ? (
                    <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[10px] opacity-60">
                      选做
                    </span>
                  ) : null}
                  {subject ? <span className="text-[11px] opacity-40">{subject.name}</span> : null}
                  {task.due ? (
                    <span className="text-[11px] tabular-nums opacity-40">{task.due}</span>
                  ) : null}
                  {task.subtasks.length > 0 ? (
                    <span className="text-[11px] tabular-nums opacity-40">
                      {doneSubtasks}/{task.subtasks.length}
                    </span>
                  ) : null}

                  <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="上移"
                      onClick={() => void moveTask(normalized, index, -1, Date.now())}
                      className="px-1 text-xs opacity-50"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      onClick={() => void moveTask(normalized, index, 1, Date.now())}
                      className="px-1 text-xs opacity-50"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => void addSubtask(task)}
                      className="px-1 text-xs opacity-50"
                    >
                      子项
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(db, task.id)}
                      className="px-1 text-xs opacity-50"
                    >
                      删除
                    </button>
                  </span>
                </div>

                {task.subtasks.length > 0 ? (
                  <ul className="mt-1.5 ml-7 space-y-1">
                    {task.subtasks.map((subtask) => (
                      <li key={subtask.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={subtask.done}
                          onChange={(event) =>
                            void updateTask(
                              db,
                              task.id,
                              {
                                subtasks: task.subtasks.map((item) =>
                                  item.id === subtask.id
                                    ? { ...item, done: event.target.checked }
                                    : item,
                                ),
                              },
                              Date.now(),
                            )
                          }
                          className="size-3"
                        />
                        <span
                          className={`text-xs ${subtask.done ? 'line-through opacity-40' : 'opacity-70'}`}
                        >
                          {subtask.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
