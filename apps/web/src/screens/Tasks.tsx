import { newId } from '@gofor/core';
import {
  normalizeTask,
  SUBJECT_TAG_POOL_ID,
  type Subject,
  type TagPool,
  type Task,
} from '@gofor/core/domain';
import {
  createTask,
  db,
  deleteTagPool,
  deleteTask,
  ensureSubjects,
  listSubjects,
  listTagPools,
  saveTagPool,
  setTaskDone,
  updateTask,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** `normalizeTask` 补全后的任务：subtasks / tags 一定有值，界面里不用再判空。 */
type TaskView = ReturnType<typeof normalizeTask>;

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

/**
 * 写任务的标签与科目。
 *
 * 走仓储的 `updateTask`（TaskPatch 已包含 tags / subjectId）：字段级补丁只覆盖
 * 这里点名的字段，updatedAt 由仓储统一维护，不自己拼一次 Dexie 写入。
 */
async function patchTaskTags(
  id: string,
  tags: string[],
  subjectId: string | null,
  now: number,
): Promise<void> {
  await updateTask(db, id, { tags, subjectId }, now);
}

/** 科目池是虚拟池（标签名 = 科目名），按名字反查科目，用来同步 subjectId。 */
function subjectForTag(subjects: Subject[], tag: string): Subject | undefined {
  return subjects.find((item) => item.name === tag);
}

/**
 * 某个标签在当前任务上是否已选中。
 *
 * 旧数据可能只存了 subjectId、没有对应标签，所以科目池额外用 subjectId 兜底，
 * 避免出现"科目是数学、界面上却没高亮数学"的错位。
 */
function isTagSelected(task: TaskView, pool: TagPool, tag: string, subjects: Subject[]): boolean {
  if (task.tags.includes(tag)) return true;
  if (pool.id !== SUBJECT_TAG_POOL_ID) return false;
  const subject = subjectForTag(subjects, tag);
  return subject !== undefined && subject.id === task.subjectId;
}

interface TagChoicesProps {
  pools: TagPool[];
  isSelected: (pool: TagPool, tag: string) => boolean;
  onToggle: (poolId: string, tag: string) => void;
}

/**
 * 按池分组的标签列表。
 *
 * 任务行与「添加栏」展示的池、样式、点击语义完全一样，差别只在
 * 「怎么算选中」「点了往哪写」，所以抽成一份渲染由调用方注入这两件事。
 * 复制两份的话，以后改配色或池的规则必然漏掉一边。
 */
function TagChoices({ pools, isSelected, onToggle }: TagChoicesProps) {
  return (
    <>
      {pools.map((pool) => (
        <div key={pool.id} className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] opacity-45">
            <span>{pool.name}</span>
            {pool.id === SUBJECT_TAG_POOL_ID ? <span>（跟随科目列表）</span> : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {pool.tags.length === 0 ? (
              <span className="text-[10px] opacity-30">还没有标签</span>
            ) : (
              pool.tags.map((tag) => {
                const selected = isSelected(pool, tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggle(pool.id, tag)}
                    className={
                      selected
                        ? 'rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-[11px] text-white'
                        : 'rounded-full border border-black/10 px-2 py-0.5 text-[11px] opacity-60 transition hover:opacity-100'
                    }
                  >
                    {tag}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ))}
    </>
  );
}

interface TagPanelProps {
  task: TaskView;
  pools: TagPool[];
  subjects: Subject[];
  onToggle: (task: TaskView, poolId: string, tag: string) => void;
  onCreate: (task: TaskView, poolId: string, tag: string) => void;
}

/**
 * 单个任务的标签面板。
 *
 * 只负责"选/取消"和"新建一个标签"，池本身的增删在页面底部的「标签管理」里做，
 * 这样任务面板不需要知道池是怎么存进 Dexie 的。
 */
function TagPanel({ task, pools, subjects, onToggle, onCreate }: TagPanelProps) {
  const writablePools = pools.filter((pool) => pool.id !== SUBJECT_TAG_POOL_ID);
  // 科目池是虚拟池，往里"新建标签"等于凭空造一门课，所以新建只落到自定义池。
  const [targetPoolId, setTargetPoolId] = useState(writablePools[0]?.id ?? '');
  const [draft, setDraft] = useState('');

  // 池可能被删掉：跟着最新的池列表回退，避免把新标签写进一个不存在的池。
  const targetPool = writablePools.find((pool) => pool.id === targetPoolId) ?? writablePools[0];

  const submit = () => {
    const tag = draft.trim();
    if (tag === '' || targetPool === undefined) return;
    onCreate(task, targetPool.id, tag);
    setDraft('');
  };

  return (
    <div className="mt-2 ml-7 space-y-2 rounded-lg border border-black/[0.08] bg-white/70 p-2.5">
      <TagChoices
        pools={pools}
        isSelected={(pool, tag) => isTagSelected(task, pool, tag, subjects)}
        onToggle={(poolId, tag) => onToggle(task, poolId, tag)}
      />

      {writablePools.length === 0 ? (
        <p className="border-t border-black/[0.06] pt-2 text-[10px] opacity-40">
          想加自己的标签，先在下方「标签管理」里建一个池。
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-black/[0.06] pt-2">
          <span className="text-[10px] opacity-40">新建标签加到</span>
          {writablePools.map((pool) => (
            <button
              key={pool.id}
              type="button"
              onClick={() => setTargetPoolId(pool.id)}
              className={
                targetPool !== undefined && pool.id === targetPool.id
                  ? 'rounded-full bg-black/[0.08] px-2 py-0.5 text-[10px]'
                  : 'rounded-full px-2 py-0.5 text-[10px] opacity-40 hover:opacity-70'
              }
            >
              {pool.name}
            </button>
          ))}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="新建标签，回车确认"
            className="w-40 rounded border border-black/10 bg-white/70 px-2 py-1 text-[11px] outline-none"
          />
        </div>
      )}
    </div>
  );
}

interface TagManagerProps {
  subjects: Subject[];
  pools: TagPool[];
}

/**
 * 标签管理：管「池」和池里的标签，不碰已有任务。
 *
 * 删除池刻意不级联清除任务上的同名标签：任务标签是用户自己打的，
 * 静默删除等于数据丢失；所以这里先明确提示，让用户自己去摘。
 */
function TagManager({ subjects, pools }: TagManagerProps) {
  const customPools = pools.filter((pool) => pool.id !== SUBJECT_TAG_POOL_ID);
  const [open, setOpen] = useState(false);
  const [poolName, setPoolName] = useState('');
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const createPool = useCallback(async () => {
    const name = poolName.trim();
    if (name === '') return;
    // id 用 newId()：池名不是主键，允许重名，下次改名/删池都不会串数据。
    await saveTagPool(db, newId(), name, []);
    setPoolName('');
  }, [poolName]);

  const addPoolTag = useCallback(
    async (pool: TagPool) => {
      const tag = (tagDrafts[pool.id] ?? '').trim();
      if (tag === '') return;
      if (!pool.tags.includes(tag)) {
        await saveTagPool(db, pool.id, pool.name, [...pool.tags, tag]);
      }
      setTagDrafts((current) => ({ ...current, [pool.id]: '' }));
    },
    [tagDrafts],
  );

  const removePoolTag = useCallback(async (pool: TagPool, tag: string) => {
    await saveTagPool(
      db,
      pool.id,
      pool.name,
      pool.tags.filter((item) => item !== tag),
    );
  }, []);

  return (
    <section className="rounded-xl border border-black/[0.08] bg-white/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs opacity-60 hover:opacity-100"
      >
        <span>标签管理</span>
        <span className="opacity-50">{open ? '收起' : '展开'}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-black/[0.06] px-4 py-3 text-xs">
          <p className="opacity-40">
            「科目」是常驻池，标签跟着科目列表走，不能在这里增删；自定义池只收集标签，不影响任务。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={poolName}
              onChange={(event) => setPoolName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createPool();
                }
              }}
              placeholder="新建池，如：错因"
              className="w-48 rounded border border-black/10 bg-white/70 px-2 py-1 outline-none"
            />
            <button
              type="button"
              onClick={() => void createPool()}
              className="rounded-lg bg-[var(--color-ink)] px-3 py-1 text-[11px] text-white"
            >
              新建池
            </button>
            <span className="text-[10px] opacity-30">
              {subjects.length} 个科目 · {customPools.length} 个自定义池
            </span>
          </div>

          {customPools.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/[0.12] px-3 py-4 text-center text-[11px] opacity-40">
              还没有自定义池。可以先建「错因」「章节」这类池，再到任务上打标签。
            </p>
          ) : (
            <ul className="space-y-2">
              {customPools.map((pool) => (
                <li key={pool.id} className="space-y-1.5 rounded-lg border border-black/[0.06] p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pool.name}</span>
                    <span className="text-[10px] opacity-30">{pool.tags.length} 个标签</span>
                    <span className="flex-1" />
                    {pendingDeleteId === pool.id ? (
                      <span className="flex flex-wrap items-center gap-2 text-[10px] text-amber-700">
                        <span>任务上已打的同名标签不会自动清除，需要自己摘。确定删除？</span>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteTagPool(db, pool.id);
                            setPendingDeleteId(null);
                          }}
                          className="rounded border border-amber-300 px-2 py-0.5"
                        >
                          删除池
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="rounded border border-black/10 px-2 py-0.5 opacity-60"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(pool.id)}
                        className="rounded border border-black/10 px-2 py-0.5 text-[10px] opacity-50 hover:opacity-80"
                      >
                        删除池
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {pool.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] opacity-70"
                      >
                        {tag}
                        <button
                          type="button"
                          aria-label={`从池「${pool.name}」删除标签 ${tag}`}
                          onClick={() => void removePoolTag(pool, tag)}
                          className="opacity-50 hover:opacity-90"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDrafts[pool.id] ?? ''}
                      onChange={(event) =>
                        setTagDrafts((current) => ({
                          ...current,
                          [pool.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addPoolTag(pool);
                        }
                      }}
                      placeholder="加标签，回车"
                      className="w-32 rounded border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] outline-none"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** 离线·M2 作业清单：截止时间、必做/选做、步骤、标签池、排序。 */
export function Tasks({ tasks }: { tasks: Task[] }) {
  const [draft, setDraft] = useState('');
  const [optional, setOptional] = useState(false);
  const [due, setDue] = useState('');
  /**
   * 「添加栏」里已选的标签（只有名字，科目 id 在提交时反查）。
   *
   * 这一段是草稿态：选中不等于落库，添加时才写进新任务，所以取消不会影响任何已有任务。
   */
  const [draftTags, setDraftTags] = useState<string[]>([]);
  /** 「添加栏」的标签面板是否展开；与任务行展开的标签面板互不影响。 */
  const [draftTagPanelOpen, setDraftTagPanelOpen] = useState(false);
  /** 当前展开标签面板的任务 id，同一时间只展开一个。 */
  const [tagPanelTaskId, setTagPanelTaskId] = useState<string | null>(null);
  /** 当前展开的"添加步骤"行内输入框，null 表示收起。 */
  const [subtaskDraft, setSubtaskDraft] = useState<{ taskId: string; value: string } | null>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const subtaskOpenTaskId = subtaskDraft?.taskId ?? null;

  /*
   * 行内输入框出现时自动聚焦（只在"打开/切到另一条任务"时触发，输入时不重复聚焦）。
   * 不用 autoFocus：Biome 的 a11y 规则禁止，而且那样在列表重渲染时行为不确定。
   */
  useEffect(() => {
    if (subtaskOpenTaskId !== null) subtaskInputRef.current?.focus();
  }, [subtaskOpenTaskId]);

  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);
  const customPools = useLiveQuery(() => listTagPools(db), [], [] as TagPool[]);

  useEffect(() => {
    void ensureSubjects(db);
  }, []);

  /**
   * 科目池是虚拟池：标签直接取科目名，绝不写 tagPools 表——
   * 否则同一门课会有两份数据，改科目名时必然不一致。
   */
  const pools = useMemo<TagPool[]>(
    () => [
      { id: SUBJECT_TAG_POOL_ID, name: '科目', tags: subjects.map((subject) => subject.name) },
      ...customPools,
    ],
    [subjects, customPools],
  );

  const normalized = useMemo(() => tasks.map(normalizeTask), [tasks]);

  const add = useCallback(async () => {
    const title = draft.trim();
    if (title === '') return;
    const now = Date.now();
    /*
     * 科目标签 ↔ subjectId：一个任务只挂一个科目（和任务行的单选规则一致），
     * 所以从已选标签里反查第一个命中科目的标签，换科目时旧的科目名已经被 toggle
     * 摘掉了，这里拿到的就是当前科目。不写 subjectId 会出现"标签是数学、科目却是空"，
     * 以后按科目统计会漏掉这条任务。
     */
    const subject = draftTags
      .map((tag) => subjectForTag(subjects, tag))
      .find((item): item is Subject => item !== undefined);
    const task = await createTask(db, {
      id: newId(),
      title,
      due: due === '' ? null : due,
      now,
      subjectId: subject?.id ?? null,
    });
    if (optional) await updateTask(db, task.id, { optional: true }, now);
    // createTask 不接受 tags，标签走一次字段级补丁；没选就不写，保持旧数据的空标签语义。
    if (draftTags.length > 0) await updateTask(db, task.id, { tags: draftTags }, now);
    setDraft('');
    // 截止与选做是"这一条"的属性，不清空会悄悄带到下一条作业。
    setDue('');
    setOptional(false);
    /*
     * 标签**不清空**（用户要求）：连续录入同科作业是常态，
     * 每加一条都重选一遍标签纯属加摩擦。
     * 代价是标签会带到下一条任务，所以面板保持展开、已选标签原样显示，
     * 用户随时能点掉——不需要靠"清空"来保证不误带。
     * 面板的展开状态也不动：用户刚才是开着还是收着，加完仍是那样。
     */
  }, [draft, due, optional, draftTags, subjects]);

  /**
   * 添加栏里切换标签。科目池与任务行保持一致：单选，换科目时先把其它科目名摘掉，
   * 不然草稿里会同时挂着两门课，提交时 subjectId 只能存一个，数据自相矛盾。
   */
  const toggleDraftTag = useCallback(
    (poolId: string, tag: string) => {
      setDraftTags((current) => {
        if (poolId !== SUBJECT_TAG_POOL_ID) {
          return current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
        }
        if (current.includes(tag)) return current.filter((item) => item !== tag);
        const subjectNames = new Set(subjects.map((item) => item.name));
        return [...current.filter((item) => !subjectNames.has(item)), tag];
      });
    },
    [subjects],
  );

  const toggleTag = useCallback(
    async (task: TaskView, poolId: string, tag: string) => {
      const now = Date.now();
      if (poolId !== SUBJECT_TAG_POOL_ID) {
        const tags = task.tags.includes(tag)
          ? task.tags.filter((item) => item !== tag)
          : [...task.tags, tag];
        await patchTaskTags(task.id, tags, task.subjectId, now);
        return;
      }

      /*
       * 科目是知识组织的主维度，所以科目池的标签与 task.subjectId 双向同步：
       * 选中标签时把 subjectId 写成该科目 id，取消时置 null。
       * 不这么做就会产生"标签写着数学、科目却是空的"这种自相矛盾的数据，
       * 以后的按科目统计会漏掉这条任务。
       */
      const subject = subjectForTag(subjects, tag);
      const selected =
        (subject !== undefined && subject.id === task.subjectId) || task.tags.includes(tag);
      if (selected) {
        await patchTaskTags(
          task.id,
          task.tags.filter((item) => item !== tag),
          null,
          now,
        );
        return;
      }

      // 科目单选：换科目时顺手摘掉其它科目标签，一个任务只挂一个科目。
      const subjectNames = new Set(subjects.map((item) => item.name));
      const tags = [...task.tags.filter((item) => !subjectNames.has(item)), tag];
      await patchTaskTags(task.id, tags, subject?.id ?? null, now);
    },
    [subjects],
  );

  const addTagToPool = useCallback(
    async (task: TaskView, poolId: string, tag: string) => {
      const pool = customPools.find((item) => item.id === poolId);
      if (!pool) return;
      const now = Date.now();
      if (!pool.tags.includes(tag)) {
        await saveTagPool(db, pool.id, pool.name, [...pool.tags, tag]);
      }
      // 新标签建完顺手打到当前任务上，省一次点击。
      if (!task.tags.includes(tag)) {
        await patchTaskTags(task.id, [...task.tags, tag], task.subjectId, now);
      }
    },
    [customPools],
  );

  const toggleSubtask = useCallback(async (task: TaskView, subtaskId: string) => {
    await updateTask(
      db,
      task.id,
      {
        subtasks: task.subtasks.map((item) =>
          item.id === subtaskId ? { ...item, done: !item.done } : item,
        ),
      },
      Date.now(),
    );
  }, []);

  const addSubtask = useCallback(
    async (task: TaskView) => {
      if (subtaskDraft === null || subtaskDraft.taskId !== task.id) return;
      const title = subtaskDraft.value.trim();
      if (title === '') return;
      await updateTask(
        db,
        task.id,
        { subtasks: [...task.subtasks, { id: newId(), title, done: false }] },
        Date.now(),
      );
      // 不清空"展开"状态、只清内容，方便连续加步骤。
      setSubtaskDraft({ taskId: task.id, value: '' });
    },
    [subtaskDraft],
  );

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
          <span className="flex-1" />
          {/*
            与任务行的「标签」按钮保持同一套交互：点开行内面板、按池列出、点一下切换。
            数量直接写在按钮上，收起时也能看出这条草稿带了几个标签。
          */}
          <button
            type="button"
            aria-label="添加栏标签"
            aria-expanded={draftTagPanelOpen}
            onClick={() => setDraftTagPanelOpen((value) => !value)}
            className={`rounded border px-2 py-1 text-[11px] transition ${
              draftTags.length > 0
                ? 'border-black/20 bg-black/[0.06]'
                : 'border-black/10 bg-white/70'
            }`}
          >
            标签{draftTags.length > 0 ? ` · ${draftTags.length}` : ''}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {draftTags.length === 0 ? (
            <span className="text-[11px] opacity-35">未选标签</span>
          ) : (
            draftTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] opacity-70"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`移除标签 ${tag}`}
                  onClick={() => setDraftTags((current) => current.filter((item) => item !== tag))}
                  className="opacity-50 hover:opacity-90"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        {draftTagPanelOpen ? (
          <div className="space-y-2 rounded-lg border border-black/[0.08] bg-white/70 p-2.5">
            <TagChoices
              pools={pools}
              isSelected={(_pool, tag) => draftTags.includes(tag)}
              onToggle={toggleDraftTag}
            />
            <p className="border-t border-black/[0.06] pt-2 text-[10px] opacity-40">
              新标签去下方「标签管理」里建，建好就能在这里选。
            </p>
          </div>
        ) : null}
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
            // 旧数据可能只有 subjectId、没有对应标签，这里补一个展示，不改库。
            const visibleTags = new Set(task.tags);
            if (subject !== undefined) visibleTags.add(subject.name);

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

                  {visibleTags.size > 0 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {[...visibleTags].map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] opacity-60"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}

                  {task.optional ? (
                    <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[10px] opacity-60">
                      选做
                    </span>
                  ) : null}
                  {task.due ? (
                    <span className="text-[11px] tabular-nums opacity-40">{task.due}</span>
                  ) : null}
                  {task.subtasks.length > 0 ? (
                    <span className="text-[11px] tabular-nums opacity-40">
                      {doneSubtasks}/{task.subtasks.length} 步
                    </span>
                  ) : null}

                  {/* 触屏没有 hover，小屏常显操作，桌面保持悬停出现。 */}
                  <span className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
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
                      aria-label="标签"
                      aria-expanded={tagPanelTaskId === task.id}
                      onClick={() =>
                        setTagPanelTaskId((current) => (current === task.id ? null : task.id))
                      }
                      className="px-1 text-xs opacity-50"
                    >
                      标签
                    </button>
                    <button
                      type="button"
                      aria-label="添加步骤"
                      onClick={() =>
                        setSubtaskDraft((current) =>
                          current?.taskId === task.id ? null : { taskId: task.id, value: '' },
                        )
                      }
                      className="px-1 text-xs opacity-50"
                    >
                      + 步骤
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
                  <ul className="mt-1.5 ml-7 space-y-0.5">
                    {task.subtasks.map((subtask) => (
                      <li key={subtask.id}>
                        {/*
                          用 label 包住整行：点标题、点空白都能切换，
                          比原来只有 12px 的小方块可点（手指几乎不可能命中）好按得多。
                          label 会原生命中 checkbox，所以不需要再手写 onClick 和
                          stopPropagation —— 没有父级点击处理器，也没有双重触发。
                        */}
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 transition hover:bg-black/[0.03]">
                          <input
                            type="checkbox"
                            aria-label={`完成步骤 ${subtask.title}`}
                            checked={subtask.done}
                            onChange={() => void toggleSubtask(task, subtask.id)}
                            className="size-4 shrink-0"
                          />
                          <span
                            className={`text-xs ${subtask.done ? 'line-through opacity-40' : 'opacity-70'}`}
                          >
                            {subtask.title}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {subtaskDraft !== null && subtaskDraft.taskId === task.id ? (
                  <div className="mt-1 ml-7">
                    <input
                      ref={subtaskInputRef}
                      value={subtaskDraft.value}
                      onChange={(event) =>
                        setSubtaskDraft({ taskId: task.id, value: event.target.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addSubtask(task);
                        }
                        if (event.key === 'Escape') setSubtaskDraft(null);
                      }}
                      placeholder="这一步做什么？回车添加"
                      className="w-full rounded border border-black/10 bg-white/70 px-2 py-1 text-xs outline-none"
                    />
                  </div>
                ) : null}

                {tagPanelTaskId === task.id ? (
                  <TagPanel
                    key={task.id}
                    task={task}
                    pools={pools}
                    subjects={subjects}
                    onToggle={(target, poolId, tag) => void toggleTag(target, poolId, tag)}
                    onCreate={(target, poolId, tag) => void addTagToPool(target, poolId, tag)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <TagManager subjects={subjects} pools={pools} />
    </div>
  );
}
