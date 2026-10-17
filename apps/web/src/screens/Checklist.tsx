import { newId } from '@gofor/core';
import { type Checklist, type ChecklistLog, dateKey } from '@gofor/core/domain';
import { addDays } from '@gofor/core/stats';
import {
  db,
  deleteChecklist,
  getChecklistLog,
  listChecklistLogs,
  listChecklists,
  saveChecklist,
  setChecklistLog,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { appClock } from '../clock.ts';

/** 历史完成率只回看 30 天：够看出习惯，又不会把整张表读进内存。 */
const HISTORY_DAYS = 30;

/**
 * 环境隔离清单。
 *
 * 「开始学习前把手机放远、桌面清空」这类流程，做成可编辑的条目；
 * 勾选状态按天存在 `checklistLogs`（主键 `${id}@${date}`），条目本身只存文字。
 * 完成率是现算的，不落库——存两份必然会在改条目之后对不上。
 */
export function ChecklistScreen() {
  const today = dateKey(appClock);
  const checklists = useLiveQuery(() => listChecklists(db), [], [] as Checklist[]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 列表被删空 / 选中的那条被删掉时，自动落到第一条；否则界面会停在空白详情上。
  useEffect(() => {
    if (checklists.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!checklists.some((checklist) => checklist.id === selectedId)) {
      setSelectedId(checklists[0]?.id ?? null);
    }
  }, [checklists, selectedId]);

  const selected = checklists.find((checklist) => checklist.id === selectedId) ?? null;

  const createChecklist = async () => {
    const name = newName.trim();
    if (name === '') return;
    setError(null);
    const checklist: Checklist = { id: newId(), name, items: [], createdAt: appClock.now() };
    try {
      await saveChecklist(db, checklist);
      setNewName('');
      setCreating(false);
      setSelectedId(checklist.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '新建失败');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium opacity-50">环境隔离清单</h2>
          <p className="mt-1 text-[11px] opacity-35">
            开始学习前照着勾一遍；勾选状态按天保存，历史完成率会自己算出来
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setError(null);
          }}
          className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs opacity-70 transition hover:opacity-100"
        >
          {creating ? '取消' : '新建清单'}
        </button>
      </div>

      {error ? (
        <p
          className="rounded-lg bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-700/70"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createChecklist();
          }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.08] bg-white/60 p-3"
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="清单名称，如：开始学习前"
            aria-label="新清单名称"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={newName.trim() === ''}
            className="rounded-lg bg-[var(--color-ink)] px-3 py-2 text-xs text-white transition disabled:opacity-40"
          >
            创建
          </button>
        </form>
      ) : null}

      {checklists.length === 0 ? (
        <div className="rounded-xl border border-black/[0.08] bg-white/50 px-4 py-10 text-center">
          <p className="text-sm opacity-60">还没有清单</p>
          <p className="mt-2 text-[11px] leading-relaxed opacity-35">
            可以从「手机放远」「桌面清空」「水杯装好」开始，
            <br />
            每一条都会变成今天可以勾的一行。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
          <aside className="space-y-1.5">
            {checklists.map((checklist) => (
              <button
                key={checklist.id}
                type="button"
                onClick={() => setSelectedId(checklist.id)}
                aria-current={checklist.id === selectedId ? 'true' : undefined}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  checklist.id === selectedId
                    ? 'border-black/[0.12] bg-white'
                    : 'border-black/[0.06] bg-white/50 hover:bg-white/80'
                }`}
              >
                <span className="block truncate">{checklist.name}</span>
                <span className="mt-0.5 block text-[10px] opacity-35">
                  {checklist.items.length} 条
                </span>
              </button>
            ))}
          </aside>

          <div>
            {selected ? (
              <ChecklistDetail key={selected.id} checklist={selected} today={today} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChecklistDetailProps {
  checklist: Checklist;
  /** 'YYYY-MM-DD'。由父级算好传入：详情只关心"勾哪一天"，不重复读时钟。 */
  today: string;
}

/** 选中清单的详情：改名、编辑条目、勾今天、看历史完成率。 */
function ChecklistDetail({ checklist, today }: ChecklistDetailProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(checklist.name);
  const [newItem, setNewItem] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(checklist.name);
  }, [checklist.name]);

  const log = useLiveQuery(
    () => getChecklistLog(db, checklist.id, today),
    [checklist.id, today],
    undefined,
  );

  const historyFrom = useMemo(() => addDays(today, -HISTORY_DAYS), [today]);
  const historyTo = useMemo(() => addDays(today, -1), [today]);
  const history = useLiveQuery(
    () => listChecklistLogs(db, historyFrom, historyTo),
    [historyFrom, historyTo],
    [] as ChecklistLog[],
  );

  const checked = useMemo(() => new Set(log?.done ?? []), [log]);

  /**
   * 最近 30 天的平均完成率。
   *
   * 分母用**当前**条目数：历史日志只记了勾上的文字，没有记当时的条目总数。
   * 条目被删减后老日志会显得偏低，这是已知的口径限制；界面上写明"按当前条目数"，
   * 不假装是精确的历史值。
   */
  const historyStats = useMemo(() => {
    if (checklist.items.length === 0) return null;
    const rows = history.filter((entry) => entry.checklistId === checklist.id);
    if (rows.length === 0) return null;
    let sum = 0;
    for (const row of rows) {
      sum += Math.min(1, row.done.length / checklist.items.length);
    }
    return { days: rows.length, average: sum / rows.length };
  }, [history, checklist.id, checklist.items.length]);

  const writeItems = async (items: string[]) => {
    setError(null);
    try {
      await saveChecklist(db, { ...checklist, items });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存条目失败');
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (name === '' || name === checklist.name) {
      setRenaming(false);
      return;
    }
    setError(null);
    try {
      await saveChecklist(db, { ...checklist, name });
      setRenaming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '改名失败');
    }
  };

  const addItem = async () => {
    const item = newItem.trim();
    if (item === '') return;
    if (checklist.items.includes(item)) {
      setError('这一条已经有了');
      return;
    }
    await writeItems([...checklist.items, item]);
    setNewItem('');
  };

  /** 改条目文字。已勾的今天会跟着改，否则"勾了但文字变了"会显示成没勾。 */
  const renameItem = async (index: number) => {
    const next = itemDraft.trim();
    const old = checklist.items[index];
    if (old === undefined) return;
    if (next === '' || next === old) {
      setEditingIndex(null);
      return;
    }
    // 条目文字被拿来当勾选记录的主键，重复会让两条都显示成勾上。
    if (checklist.items.includes(next)) {
      setError('这一条已经有了');
      return;
    }
    const items = checklist.items.map((item, cursor) => (cursor === index ? next : item));
    setError(null);
    try {
      await saveChecklist(db, { ...checklist, items });
      if (log?.done.includes(old)) {
        const done = log.done
          .map((item) => (item === old ? next : item))
          .filter((item) => items.includes(item));
        await setChecklistLog(db, checklist.id, today, done, appClock.now());
      }
      setEditingIndex(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存条目失败');
    }
  };

  const removeItem = async (index: number) => {
    const removed = checklist.items[index];
    if (removed === undefined) return;
    const items = checklist.items.filter((_, cursor) => cursor !== index);
    setError(null);
    try {
      await saveChecklist(db, { ...checklist, items });
      // 今天已勾的这一条也要从日志里拿掉，不然完成数会大于条目数。
      if (log?.done.includes(removed)) {
        await setChecklistLog(
          db,
          checklist.id,
          today,
          log.done.filter((item) => item !== removed),
          appClock.now(),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除条目失败');
    }
  };

  const toggleItem = async (item: string, nextChecked: boolean) => {
    if (pending) return;
    const next = new Set(log?.done ?? []);
    if (nextChecked) {
      next.add(item);
    } else {
      next.delete(item);
    }
    // 按清单顺序写回，顺带丢掉「条目已被删掉、日志里还留着」的脏文字。
    const done = checklist.items.filter((entry) => next.has(entry));
    setPending(true);
    setError(null);
    try {
      await setChecklistLog(db, checklist.id, today, done, appClock.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存勾选失败');
    } finally {
      setPending(false);
    }
  };

  const removeChecklist = async () => {
    setError(null);
    try {
      await deleteChecklist(db, checklist.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除清单失败');
    }
  };

  const checkedCount = checklist.items.filter((item) => checked.has(item)).length;
  const percent =
    checklist.items.length === 0 ? 0 : Math.round((checkedCount / checklist.items.length) * 100);

  return (
    <div className="space-y-5 rounded-xl border border-black/[0.08] bg-white/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {renaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              aria-label="清单名称"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-ink)] px-2.5 py-1.5 text-[11px] text-white"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setNameDraft(checklist.name);
                setRenaming(false);
              }}
              className="text-[11px] opacity-40 hover:opacity-70"
            >
              取消
            </button>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium">{checklist.name}</h3>
            <p className="mt-0.5 text-[11px] opacity-35">
              今天 {checkedCount} / {checklist.items.length} 已勾 · {percent}%
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px]">
          {renaming ? null : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="opacity-40 transition hover:opacity-70"
            >
              改名
            </button>
          )}
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => void removeChecklist()}
                className="rounded-lg bg-red-600/80 px-2.5 py-1.5 text-white"
              >
                确认删除？
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="opacity-40 transition hover:opacity-70"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="opacity-40 transition hover:opacity-70"
            >
              删除清单
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-700/70"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {checklist.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-[11px] opacity-35">
          还没有条目。在下面加一条，比如「手机放到另一个房间」。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {checklist.items.map((item, index) => (
            <li
              key={item}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.02]"
            >
              {editingIndex === index ? (
                <input
                  value={itemDraft}
                  onChange={(event) => setItemDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void renameItem(index);
                    }
                    if (event.key === 'Escape') setEditingIndex(null);
                  }}
                  aria-label="条目文字"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-sm outline-none"
                />
              ) : (
                <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked.has(item)}
                    disabled={pending}
                    onChange={(event) => void toggleItem(item, event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-ink)]"
                  />
                  <span className="min-w-0 break-words">{item}</span>
                </label>
              )}

              {editingIndex === index ? (
                <>
                  <button
                    type="button"
                    onClick={() => void renameItem(index)}
                    className="text-[11px] opacity-50 transition hover:opacity-80"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="text-[11px] opacity-35 transition hover:opacity-60"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIndex(index);
                      setItemDraft(item);
                    }}
                    className="text-[11px] opacity-35 transition hover:opacity-60"
                  >
                    改
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeItem(index)}
                    className="text-[11px] opacity-35 transition hover:opacity-60"
                  >
                    删
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void addItem();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="加一条，如：手机放到另一个房间"
          aria-label="新条目"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={newItem.trim() === ''}
          className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] opacity-70 transition disabled:opacity-30"
        >
          添加
        </button>
      </form>

      <div className="border-t border-black/[0.06] pt-3 text-[11px] opacity-40">
        {historyStats === null ? (
          <span>今天之前还没有记录，先勾今天这一遍。</span>
        ) : (
          <span>
            最近 {HISTORY_DAYS} 天：有 {historyStats.days} 天记录，平均完成{' '}
            {Math.round(historyStats.average * 100)}%（按当前条目数估算）
          </span>
        )}
      </div>
    </div>
  );
}
