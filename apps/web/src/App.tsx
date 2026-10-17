import { newId, systemClock } from '@gofor/core';
import { type AppConfig, mergeConfig, resolveUnitMinutes } from '@gofor/core/config';
import { dateKey, type StudySession, type Subject, type Task } from '@gofor/core/domain';
import { type Block, layout, PAPER_SIZES, type PaperId } from '@gofor/core/print';
import {
  addSession,
  createTask,
  currentConfigOrDefault,
  db,
  deleteSession,
  deleteTask,
  ensureSubjects,
  exportAll,
  importAll,
  listSessionsByDate,
  listSubjects,
  listTasks,
  saveConfig,
  setTaskDone,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Command, CommandPalette } from './components/CommandPalette.tsx';
import { PrintLayer, PrintPreview } from './print/PrintSheet.tsx';

const FOCUS_CELLS = 5;

function todayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/**
 * 用配置与当天数据拼出「我的一天」模板。
 *
 * P1 会把这里换成可编辑的模板 JSON；现在先硬编码一版，
 * 目的是尽快验证「数据 → 版式 → 打印」这条链路真的通。
 */
function buildTodayBlocks(config: AppConfig, subjects: Subject[], date: string): Block[] {
  const rows = Math.min(6, Math.max(3, subjects.length));
  // 行数随纸张自适应：A4 竖向空间大约是 A5 的 1.45 倍，浪费掉可惜。
  // 这些数字是 layout() 算过的——加行后仍是一页。
  const big = config.print.paper === 'A4';
  const taskRows = big ? 10 : 4;
  const logRows = big ? 2 : 1;

  return [
    { id: 'title', kind: 'title', span: 12, text: todayLabel(date), align: 'left' },
    {
      id: 'tasks',
      kind: 'checkboxList',
      span: 12,
      bind: 'tasks.today',
      rows: taskRows,
      showMeta: [],
    },
    {
      id: 'focus',
      kind: 'focusGrid',
      span: 12,
      bind: 'subjects.today',
      rows,
      cells: FOCUS_CELLS,
      unitMinutes: config.focus.unit,
    },
    { id: 'am', kind: 'timeLog', span: 12, dayPart: 'morning', rows: logRows, label: '上午' },
    { id: 'pm', kind: 'timeLog', span: 12, dayPart: 'afternoon', rows: logRows, label: '下午' },
    { id: 'ev', kind: 'timeLog', span: 12, dayPart: 'evening', rows: logRows, label: '晚上' },
    { id: 'slots', kind: 'slots', span: 12, labels: ['睡眠', '心情', '专注'] },
    { id: 'hint', kind: 'hintLine', span: 12, text: config.print.hintLine },
  ];
}

export function App() {
  const today = dateKey(systemClock);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 配置不能在 liveQuery 里读：它会在迁移时写库，而 liveQuery 只允许只读事务。
  const [config, setConfig] = useState<AppConfig | null>(null);
  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);
  const tasks = useLiveQuery(() => listTasks(db), [], [] as Task[]);
  const sessions = useLiveQuery(() => listSessionsByDate(db, today), [today], [] as StudySession[]);

  useEffect(() => {
    void currentConfigOrDefault(db).then((result) => setConfig(result.config));
    void ensureSubjects(db);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const unitMinutes = config ? resolveUnitMinutes(config) : 45;

  const filledCells = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of sessions) {
      if (session.source !== 'paperGrid' || !session.subjectId) continue;
      counts[session.subjectId] = (counts[session.subjectId] ?? 0) + 1;
    }
    return counts;
  }, [sessions]);

  const blocks = useMemo(
    () => (config ? buildTodayBlocks(config, subjects, today) : []),
    [config, subjects, today],
  );

  const paper: PaperId = config?.print.paper ?? 'A5';
  const sheetData = useMemo(
    () => ({ tasks, subjects, filledCells }),
    [tasks, subjects, filledCells],
  );

  const pageCount = useMemo(
    () => (blocks.length > 0 ? (layout(blocks, { paper }).pages.length ?? 0) : 0),
    [blocks, paper],
  );

  const addTask = useCallback(async () => {
    const title = draft.trim();
    if (title === '') return;
    await createTask(db, { id: newId(), title, now: Date.now() });
    setDraft('');
  }, [draft]);

  const toggleCell = useCallback(
    async (subjectId: string, index: number) => {
      const id = `grid-${today}-${subjectId}-${index}`;
      const existing = sessions.find((session) => session.id === id);
      if (existing) {
        await deleteSession(db, id);
        return;
      }
      await addSession(db, {
        id,
        date: today,
        start: index * unitMinutes,
        end: (index + 1) * unitMinutes,
        subjectId,
        taskId: null,
        source: 'paperGrid',
        createdAt: Date.now(),
      });
    },
    [sessions, today, unitMinutes],
  );

  const changePaper = useCallback(
    async (next: PaperId) => {
      if (!config) return;
      const nextConfig = mergeConfig(config, { print: { paper: next } });
      await saveConfig(db, nextConfig);
      setConfig(nextConfig);
      setNotice(`纸张已切换为 ${PAPER_SIZES[next].name}`);
    },
    [config],
  );

  const exportJson = useCallback(async () => {
    const bundle = await exportAll(db);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gofor-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('已导出 JSON');
  }, [today]);

  const commands: Command[] = useMemo(
    () => [
      { id: 'print', title: '打印今日清单', hint: '⌘P', run: () => window.print() },
      { id: 'a4', title: '切换到 A4', run: () => changePaper('A4') },
      { id: 'a5', title: '切换到 A5', run: () => changePaper('A5') },
      { id: 'export', title: '导出全部数据（JSON）', run: exportJson },
      { id: 'import', title: '导入数据（JSON）', run: () => fileInputRef.current?.click() },
    ],
    [changePaper, exportJson],
  );

  if (!config) {
    return (
      <main className="grid min-h-full place-items-center">
        <p className="text-sm opacity-50">正在打开本地数据库…</p>
      </main>
    );
  }

  return (
    <>
      <main className="screen-only mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-5 py-10">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">GoFor</h1>
            <p className="mt-1 text-sm opacity-50">{todayLabel(today)}</p>
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs opacity-70"
          >
            命令 ⌘K
          </button>
        </header>

        {notice ? (
          <div className="rounded-lg bg-black/[0.05] px-3 py-2 text-xs opacity-70">{notice}</div>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-medium opacity-50">今日清单</h2>
          <ul className="space-y-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-center gap-3 border-b border-black/[0.06] py-2"
              >
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
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addTask();
              }}
              placeholder="加一项作业，回车确认"
              className="flex-1 rounded-lg border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void addTask()}
              className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
            >
              添加
            </button>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium opacity-50">专注格</h2>
            <span className="text-xs opacity-40">一格 = {unitMinutes} 分钟，点一下即算完成</span>
          </div>
          <div className="space-y-2">
            {subjects.map((subject) => {
              const filled = filledCells[subject.id] ?? 0;
              return (
                <div key={subject.id} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-sm">{subject.name}</span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: FOCUS_CELLS }, (_, index) => (
                      <button
                        // biome-ignore lint/suspicious/noArrayIndexKey: 固定长度的位置格子，索引就是身份
                        key={`cell-${index}`}
                        type="button"
                        aria-label={`${subject.name} 第 ${index + 1} 格`}
                        onClick={() => void toggleCell(subject.id, index)}
                        className={`size-7 rounded border transition ${
                          index < filled
                            ? 'border-[var(--color-ink)] bg-[var(--color-ink)]'
                            : 'border-black/20 bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium opacity-50">纸面预览 · {PAPER_SIZES[paper].name}</h2>
            <span className={`text-xs ${pageCount > 1 ? 'text-amber-600' : 'opacity-40'}`}>
              共 {pageCount} 页{pageCount > 1 ? '（超出，建议换 A4）' : ''}
            </span>
          </div>

          {pageCount > 1 ? (
            <button
              type="button"
              onClick={() => void changePaper('A4')}
              className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
            >
              内容超出 {PAPER_SIZES[paper].name}，点这里换成 A4
            </button>
          ) : null}

          <div className="overflow-hidden">
            <PrintPreview blocks={blocks} paper={paper} data={sheetData} />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 w-full rounded-xl bg-[var(--color-ink)] py-3 text-sm font-medium text-white"
          >
            打印这一张
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed opacity-40">
            打印前请确认：缩放 100% · 关闭页眉页脚 · 勾选「背景图形」
          </p>
        </section>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const result = await importAll(db, JSON.parse(text));
              setNotice(
                `已导入 ${result.imported.tasks} 个任务、${result.imported.sessions} 条记录`,
              );
            } catch (error) {
              setNotice(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
            } finally {
              event.target.value = '';
            }
          }}
        />

        <CommandPalette
          open={paletteOpen}
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      </main>

      {/* 打印层放在 .screen-only 之外，否则打印时会被一起隐藏成白纸 */}
      <PrintLayer blocks={blocks} paper={paper} data={sheetData} />
    </>
  );
}
