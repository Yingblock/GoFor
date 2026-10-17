import type { Subject } from '@gofor/core/domain';
import { useState } from 'react';

/**
 * 科目管理：新增 / 改名 / 删除。
 *
 * 所有写操作都直接落 `subjects` 表，并立即刷新列表；
 * 课表规则只存科目 id，所以改名不需要碰任何规则。
 * 删除不级联清规则（那是静默丢数据），改为行内二次确认 + 明确后果说明。
 */
export function SubjectManager({
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
