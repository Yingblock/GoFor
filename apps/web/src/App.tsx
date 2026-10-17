import { systemClock } from '@gofor/core';
import { type AppConfig, mergeConfig } from '@gofor/core/config';
import { dateKey, type Subject, type Task } from '@gofor/core/domain';
import { type Block, materialize, type PaperId, paperFor } from '@gofor/core/print';
import { occurrencesOn, type TimetableData } from '@gofor/core/timetable';
import {
  currentConfigOrDefault,
  db,
  ensureSubjects,
  exportAll,
  importAll,
  listSubjects,
  listTasks,
  loadTimetable,
  saveConfig,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Command, CommandPalette } from './components/CommandPalette.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { groupOf, type ScreenId, titleOf } from './nav.ts';
import { PrintLayer } from './print/PrintSheet.tsx';
import { CheckinScreen } from './screens/Checkin.tsx';
import { ComingSoon } from './screens/ComingSoon.tsx';
import { Home } from './screens/Home.tsx';
import { Pomodoro } from './screens/Pomodoro.tsx';
import { PrintScreen } from './screens/PrintScreen.tsx';
import { Tasks } from './screens/Tasks.tsx';
import { TemplateEditorScreen } from './screens/TemplateEditor.tsx';
import { TimetableScreen } from './screens/Timetable.tsx';

function todayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** 与课表页共用同一个库内 id；P1 只有一个学期。 */
const TIMETABLE_ID = 'default';

/** 当日课表在纸面上的一行：时间 + 科目名。 */
interface ScheduleEntry {
  time: string;
  label: string;
}

/** 当日第几分钟 → 'HH:mm'。纸面只认字符串，格式化留在宿主层做。 */
function clockLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * 库里的课表可能是导入的坏 JSON，所以读取必须防御：形状不对就当「没有课表」。
 *
 * 除了需求点名的 `term` / `periods` / `rules`，这里还要求 `courses` / `overrides` /
 * `weekPatterns` 是数组——`occurrencesOn` 会直接遍历后两者，缺了会抛异常。
 * `startDate` 只做 `YYYY-MM-DD` 形态检查，真正的日期合法性由展开函数兜住。
 */
function asTimetable(raw: unknown): TimetableData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<TimetableData>;
  if (!Array.isArray(candidate.courses)) return null;
  if (!Array.isArray(candidate.rules)) return null;
  if (!Array.isArray(candidate.overrides)) return null;
  if (!Array.isArray(candidate.periods)) return null;
  if (!Array.isArray(candidate.weekPatterns)) return null;
  const term = candidate.term;
  if (typeof term !== 'object' || term === null) return null;
  if (typeof term.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(term.startDate)) {
    return null;
  }
  if (typeof term.weeks !== 'number') return null;
  return candidate as TimetableData;
}

export function App() {
  const today = dateKey(systemClock);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [screen, setScreen] = useState<ScreenId>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tasks = useLiveQuery(() => listTasks(db), [], [] as Task[]);

  // 课表存在 Dexie 里是 `unknown`（导入可能带进坏数据），用上面的守卫收窄。
  const timetable = useLiveQuery(() => loadTimetable(db, TIMETABLE_ID), [], undefined);
  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);

  /**
   * 当日课表：从 Dexie 一路算到纸面的一行。
   *
   * 没有课表 / 课表坏了 / 今天没课，一律给空数组——打印层据此留空行，
   * 而不是报错或跳过这块版式（版式高度是固定的）。
   */
  const schedule = useMemo<ScheduleEntry[]>(() => {
    const data = asTimetable(timetable);
    if (!data) return [];

    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
    const courseNames = new Map(data.courses.map((course) => [course.id, course.name]));

    try {
      const occurrences = occurrencesOn(today, data).sort((a, b) => a.startMinute - b.startMinute);
      return occurrences.map((occurrence) => ({
        time: clockLabel(occurrence.startMinute),
        // 优先按 id 对到科目表；课表里的 Course 是本地快照，对不上时退回它自己的名字，
        // 免得纸上印出一串 id。
        label:
          subjectNames.get(occurrence.courseId) ??
          courseNames.get(occurrence.courseId) ??
          occurrence.courseId,
      }));
    } catch {
      // 形状检查挡不住数组元素里的坏字段（比如 period.start 不是字符串），
      // 宁可纸面上没有课表，也不能让整个 App 白屏。
      return [];
    }
  }, [subjects, timetable, today]);

  useEffect(() => {
    void currentConfigOrDefault(db).then((result) => setConfig(result.config));
    // 科目是全局共享的（课表 / 番茄钟 / 作业都用它）。
    // 在启动时统一播种，避免"先打开哪个页面决定有没有科目"的不一致。
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

  const blocks = useMemo(() => {
    if (!config) return [] as Block[];
    const template = paperFor('day', config.print.paper);
    return materialize(template, { date: today, dateLabel: todayLabel(today) });
  }, [config, today]);

  const paper: PaperId = config?.print.paper ?? 'A4';

  const navigate = useCallback((next: ScreenId) => {
    setScreen(next);
    setNotice(null);
  }, []);

  const changePaper = useCallback(
    async (next: PaperId) => {
      if (!config) return;
      const nextConfig = mergeConfig(config, { print: { paper: next } });
      await saveConfig(db, nextConfig);
      setConfig(nextConfig);
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
      { id: 'home', title: '回到首页', run: () => navigate('home') },
      { id: 'tasks', title: '作业清单', run: () => navigate('tasks') },
      { id: 'print', title: '打印 checklist', hint: '⌘P', run: () => navigate('print') },
      { id: 'a4', title: '纸张切换为 A4', run: () => changePaper('A4') },
      { id: 'a5', title: '纸张切换为 A5', run: () => changePaper('A5') },
      { id: 'export', title: '导出全部数据（JSON）', run: exportJson },
      { id: 'import', title: '导入数据（JSON）', run: () => fileInputRef.current?.click() },
    ],
    [changePaper, exportJson, navigate],
  );

  if (!config) {
    return (
      <main className="grid min-h-full place-items-center">
        <p className="text-sm opacity-50">正在打开本地数据库…</p>
      </main>
    );
  }

  const groupCode = groupOf(screen);

  const body = (() => {
    switch (screen) {
      case 'home':
        return <Home tasks={tasks} onNavigate={navigate} />;
      case 'tasks':
        return <Tasks tasks={tasks} />;
      case 'checkin':
        return <CheckinScreen />;
      case 'timetable':
        return <TimetableScreen />;
      case 'templates':
        return <TemplateEditorScreen schedule={schedule} />;
      case 'pomodoro':
        return <Pomodoro />;
      case 'print':
        return (
          <PrintScreen
            blocks={blocks}
            paper={paper}
            tasks={tasks}
            schedule={schedule}
            onChangePaper={(next) => void changePaper(next)}
          />
        );
      case 'capture':
        return (
          <ComingSoon
            title="拍照录入"
            groupCode="离线·M2"
            part="offline"
            note="需要先建好 CV 管线（透视矫正、光照均衡、局部笔迹检测），属于 P2「纸的回流」。P1 先只留入口。"
          />
        );
      default:
        return (
          <ComingSoon
            title={titleOf(screen)}
            groupCode={groupCode ?? '—'}
            part={groupCode?.startsWith('在线') ? 'online' : 'offline'}
            note="这个条目已经在计划里，但还没开始实现。详见 docs/ROADMAP.md 对应阶段。"
          />
        );
    }
  })();

  return (
    <>
      <div className="screen-only flex min-h-full">
        <Sidebar
          screen={screen}
          onNavigate={navigate}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/[0.06] bg-[var(--color-paper)]/90 px-4 py-3 backdrop-blur md:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-md border border-black/10 px-2 py-1 text-xs md:hidden"
              aria-label="打开菜单"
            >
              ☰
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                {groupCode ? (
                  <span className="font-mono text-[10px] opacity-35">{groupCode}</span>
                ) : null}
                <h1 className="truncate text-base font-medium">
                  {screen === 'home' ? todayLabel(today) : titleOf(screen)}
                </h1>
              </div>
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
            <div className="mx-4 mt-3 rounded-lg bg-black/[0.05] px-3 py-2 text-xs opacity-70 md:mx-8">
              {notice}
            </div>
          ) : null}

          <div className="flex-1 px-4 py-6 md:px-8">{body}</div>
        </div>
      </div>

      {/* 打印层必须在 .screen-only 之外，否则打印时被一起隐藏成白纸 */}
      <PrintLayer blocks={blocks} paper={paper} data={{ tasks, schedule }} />

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
            setNotice(`已导入 ${result.imported.tasks} 个任务、${result.imported.sessions} 条记录`);
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
    </>
  );
}
