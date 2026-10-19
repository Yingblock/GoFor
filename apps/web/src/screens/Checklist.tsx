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
import { Button, Card, Checkbox, EmptyState, focusRing, Input, Section } from '@gofor/ui';
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
      <Section
        title="环境隔离清单"
        description="开始学习前照着勾一遍；勾选状态按天保存，历史完成率会自己算出来"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCreating((current) => !current);
              setError(null);
            }}
          >
            {creating ? '取消' : '新建清单'}
          </Button>
        }
      />

      {error ? (
        <Card tone="danger" padding="none" className="px-3 py-2 text-caption" role="alert">
          {error}
        </Card>
      ) : null}

      {creating ? (
        <Card padding="none" className="p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createChecklist();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="清单名称，如：开始学习前"
              aria-label="新清单名称"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="primary" size="sm" disabled={newName.trim() === ''}>
              创建
            </Button>
          </form>
        </Card>
      ) : null}

      {checklists.length === 0 ? (
        <EmptyState
          size="md"
          title="还没有清单"
          description={
            <>
              可以从「手机放远」「桌面清空」「水杯装好」开始，
              <br />
              每一条都会变成今天可以勾的一行。
            </>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
          <aside className="space-y-1.5">
            {checklists.map((checklist) => (
              <button
                key={checklist.id}
                type="button"
                onClick={() => setSelectedId(checklist.id)}
                aria-current={checklist.id === selectedId ? 'true' : undefined}
                className={`w-full rounded-lg border px-3 py-2 text-left text-body transition-colors duration-fast ${focusRing} ${
                  checklist.id === selectedId
                    ? 'border-ink/15 bg-white'
                    : 'border-line bg-white/50 hover:bg-white/80'
                }`}
              >
                <span className="block truncate">{checklist.name}</span>
                <span className="mt-0.5 block text-micro opacity-35">
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
    <Card padding="none" className="space-y-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {renaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              aria-label="清单名称"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="primary" size="sm">
              保存
            </Button>
            <button
              type="button"
              onClick={() => {
                setNameDraft(checklist.name);
                setRenaming(false);
              }}
              className={`text-caption opacity-40 transition-opacity duration-fast hover:opacity-70 ${focusRing}`}
            >
              取消
            </button>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className="truncate text-title font-medium">{checklist.name}</h3>
            <p className="mt-0.5 text-caption opacity-35">
              今天 {checkedCount} / {checklist.items.length} 已勾 · {percent}%
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {renaming ? null : (
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
              改名
            </Button>
          )}
          {confirmingDelete ? (
            <>
              <Button variant="danger" size="sm" onClick={() => void removeChecklist()}>
                确认删除？
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                取消
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              删除清单
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Card tone="danger" padding="none" className="px-3 py-2 text-caption" role="alert">
          {error}
        </Card>
      ) : null}

      {checklist.items.length === 0 ? (
        <EmptyState size="sm">还没有条目。在下面加一条，比如「手机放到另一个房间」。</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {checklist.items.map((item, index) => (
            <li
              key={item}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink/[0.02]"
            >
              {editingIndex === index ? (
                <Input
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
                  className="min-w-0 flex-1"
                />
              ) : (
                <label
                  htmlFor={`checklist-item-${index}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-body"
                >
                  <Checkbox
                    id={`checklist-item-${index}`}
                    checked={checked.has(item)}
                    disabled={pending}
                    onChange={(event) => void toggleItem(item, event.target.checked)}
                  />
                  <span className="min-w-0 break-words">{item}</span>
                </label>
              )}

              {editingIndex === index ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => void renameItem(index)}>
                    保存
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingIndex(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingIndex(index);
                      setItemDraft(item);
                    }}
                  >
                    改
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void removeItem(index)}>
                    删
                  </Button>
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
        <Input
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="加一条，如：手机放到另一个房间"
          aria-label="新条目"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={newItem.trim() === ''}>
          添加
        </Button>
      </form>

      <div className="border-t border-line pt-3 text-caption opacity-40">
        {historyStats === null ? (
          <span>今天之前还没有记录，先勾今天这一遍。</span>
        ) : (
          <span>
            最近 {HISTORY_DAYS} 天：有 {historyStats.days} 天记录，平均完成{' '}
            {Math.round(historyStats.average * 100)}%（按当前条目数估算）
          </span>
        )}
      </div>
    </Card>
  );
}
