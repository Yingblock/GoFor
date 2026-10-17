import { newId } from '@gofor/core';
import type { Task } from '@gofor/core/domain';
import { createTask, db, deleteTask, setTaskDone } from '@gofor/store';
import { useCallback, useState } from 'react';

/** P1·M2 作业清单。 */
export function Tasks({ tasks }: { tasks: Task[] }) {
  const [draft, setDraft] = useState('');

  const add = useCallback(async () => {
    const title = draft.trim();
    if (title === '') return;
    await createTask(db, { id: newId(), title, now: Date.now() });
    setDraft('');
  }, [draft]);

  return (
    <div className="space-y-6">
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

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-10 text-center text-xs opacity-40">
          还没有作业
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
          {tasks.map((task) => (
            <li key={task.id} className="group flex items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                checked={task.done}
                onChange={(event) =>
                  void setTaskDone(db, task.id, event.target.checked, Date.now())
                }
                className="size-4"
              />
              <span className={`flex-1 text-sm ${task.done ? 'line-through opacity-40' : ''}`}>
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => void deleteTask(db, task.id)}
                className="text-xs opacity-0 transition group-hover:opacity-40"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
