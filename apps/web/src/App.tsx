import { systemClock } from '@gofor/core';
import { type AppConfig, mergeConfig } from '@gofor/core/config';
import { dateKey, type Task } from '@gofor/core/domain';
import { type Block, materialize, type PaperId, paperFor } from '@gofor/core/print';
import {
  currentConfigOrDefault,
  db,
  exportAll,
  importAll,
  listTasks,
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

export function App() {
  const today = dateKey(systemClock);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [screen, setScreen] = useState<ScreenId>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tasks = useLiveQuery(() => listTasks(db), [], [] as Task[]);

  useEffect(() => {
    void currentConfigOrDefault(db).then((result) => setConfig(result.config));
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
        return <TemplateEditorScreen />;
      case 'pomodoro':
        return <Pomodoro />;
      case 'print':
        return (
          <PrintScreen
            blocks={blocks}
            paper={paper}
            tasks={tasks}
            onChangePaper={(next) => void changePaper(next)}
          />
        );
      case 'capture':
        return (
          <ComingSoon
            title="拍照录入"
            groupCode="P1·M2"
            stage="P1"
            note="需要先建好 CV 管线（透视矫正、光照均衡、局部笔迹检测），属于 P2「纸的回流」。P1 先只留入口。"
          />
        );
      default:
        return (
          <ComingSoon
            title={titleOf(screen)}
            groupCode={groupCode ?? '—'}
            stage={groupCode?.startsWith('P2') ? 'P2' : 'P1'}
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
      <PrintLayer blocks={blocks} paper={paper} data={{ tasks }} />

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
