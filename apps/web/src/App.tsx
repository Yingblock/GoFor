import { type AppConfig, DEFAULT_PRINT_TEMPLATE, mergeConfig } from '@gofor/core/config';
import {
  type CourseNote,
  dateKey,
  type StoredTemplate,
  type Subject,
  type Task,
} from '@gofor/core/domain';
import { type Habit, isHabitActiveOn } from '@gofor/core/habits';
import { materialize, type PaperId } from '@gofor/core/print';
import { occurrencesOn, parseTimetable } from '@gofor/core/timetable';
import {
  currentConfigOrDefault,
  db,
  ensureSubjects,
  exportAll,
  importAll,
  listCourseNotesByDate,
  listHabits,
  listSubjects,
  listTasks,
  listTemplates,
  loadTimetable,
  saveConfig,
} from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestPersistentStorage } from './backup.ts';
import { appClock } from './clock.ts';
import { BackupBanner } from './components/BackupBanner.tsx';
import { type Command, CommandPalette } from './components/CommandPalette.tsx';
import { ScreenBoundary } from './components/ErrorBoundary.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { todayLabel } from './format.ts';
import { groupOf, type ScreenId, titleOf } from './nav.ts';
import { PrintLayer, type SheetData } from './print/PrintSheet.tsx';
import { printTemplateChoices, resolvePrintTemplate } from './print/template.ts';
import { CheckinScreen } from './screens/Checkin.tsx';
import { ChecklistScreen } from './screens/Checklist.tsx';
import { ComingSoon } from './screens/ComingSoon.tsx';
import { DataScreen } from './screens/DataScreen.tsx';
import { DiaryScreen } from './screens/Diary.tsx';
import { Home } from './screens/Home.tsx';
import { MoodScreen } from './screens/Mood.tsx';
import { Pomodoro } from './screens/Pomodoro.tsx';
import { PrintScreen } from './screens/PrintScreen.tsx';
import { ReportScreen } from './screens/Report.tsx';
import { ScanScreen } from './screens/Scan.tsx';
import { Tasks } from './screens/Tasks.tsx';
import { TemplateEditorScreen } from './screens/TemplateEditor.tsx';
import { TimetableScreen } from './screens/Timetable.tsx';
import { ToolboxScreen } from './screens/Toolbox.tsx';

/** 与课表页共用同一个库内 id；P1 只有一个学期。 */
const TIMETABLE_ID = 'default';

/** 折叠态持久化用的 key：刷新/重开都要保持用户上次的选择。 */
const SIDEBAR_COLLAPSED_KEY = 'gofor.ui.sidebarCollapsed';

/** 惰性初始化读 localStorage：首帧就是最终状态，不会先画展开再跳成折叠。 */
function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    // 隐私模式 / 禁用了存储时读 localStorage 会抛；侧栏展开是安全默认值。
    return false;
  }
}

/** 只有桌面端有折叠态；窄屏是抽屉，永远是完整文字版。 */
function isDesktopLayout(): boolean {
  return window.matchMedia('(min-width: 768px)').matches;
}

/** 当日课表的一行：时间 + 科目名 + 当天备注（P2-2.15）。 */
interface ScheduleEntry {
  time: string;
  end: string;
  label: string;
  /** 课程 id 与开始分钟：备注按「日期 + 课程 + 节次」定位。 */
  courseId: string;
  startMinute: number;
  /** 当天这一节的备注，空串表示没写；纸面印在科目名后面。 */
  note: string;
}

/** 当日第几分钟 → 'HH:mm'。纸面只认字符串，格式化留在宿主层做。 */
function clockLabel(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function App() {
  const today = dateKey(appClock);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [screen, setScreen] = useState<ScreenId>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * 打印设置的「最新值」。`changePaper` / `changeTemplate` 可能在同一个事件循环里连点，
   * 只靠 `config` state 会读到旧值、后一次覆盖前一次；用 ref 保证每次都基于最新配置合并。
   */
  const configRef = useRef<AppConfig | null>(null);

  const tasks = useLiveQuery(() => listTasks(db), [], [] as Task[]);
  /** 用户模板：配置里的 template 可能指向它们，打印层 / 打印页下拉都从这里取。 */
  const customTemplates = useLiveQuery(() => listTemplates(db), [], [] as StoredTemplate[]);
  /** 今天该做的打卡项：打印到纸上的「打卡行」，扫描后按 habit id 回填。 */
  const habits = useLiveQuery(() => listHabits(db), [], [] as Habit[]);
  const activeHabits = useMemo(
    () =>
      habits
        .filter((habit) => isHabitActiveOn(habit, today))
        .map((habit) => ({ id: habit.id, name: habit.name })),
    [habits, today],
  );

  // 课表存在 Dexie 里是 `unknown`（导入可能带进坏数据），用上面的守卫收窄。
  const timetable = useLiveQuery(() => loadTimetable(db, TIMETABLE_ID), [], undefined);
  /** 今天的课程备注：打印到课表行后面；扫码回填手写备注要 OCR，属 P4。 */
  const courseNotes = useLiveQuery(
    () => listCourseNotesByDate(db, today),
    [today],
    [] as CourseNote[],
  );
  const subjects = useLiveQuery(() => listSubjects(db), [], [] as Subject[]);

  /**
   * 当日课表：从 Dexie 一路算到纸面的一行。
   *
   * 没有课表 / 课表坏了 / 今天没课，一律给空数组——打印层据此留空行，
   * 而不是报错或跳过这块版式（版式高度是固定的）。
   */
  const schedule = useMemo<ScheduleEntry[]>(() => {
    const data = parseTimetable(timetable);
    if (!data) return [];

    const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
    const courseNames = new Map(data.courses.map((course) => [course.id, course.name]));

    try {
      const occurrences = occurrencesOn(today, data).sort((a, b) => a.startMinute - b.startMinute);
      const noteByCourse = new Map(
        courseNotes.map((note) => [`${note.courseId}@${note.startMinute}`, note.text]),
      );
      return occurrences.map((occurrence) => ({
        time: clockLabel(occurrence.startMinute),
        end: clockLabel(occurrence.endMinute),
        courseId: occurrence.courseId,
        startMinute: occurrence.startMinute,
        note: noteByCourse.get(`${occurrence.courseId}@${occurrence.startMinute}`) ?? '',
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
  }, [courseNotes, subjects, timetable, today]);

  useEffect(() => {
    void currentConfigOrDefault(db).then((result) => {
      configRef.current = result.config;
      setConfig(result.config);
    });
    // 科目是全局共享的（课表 / 番茄钟 / 作业都用它）。
    // 在启动时统一播种，避免"先打开哪个页面决定有没有科目"的不一致。
    void ensureSubjects(db);
    // 申请持久化存储：否则浏览器在存储压力下可以静默清掉 IndexedDB。
    // 不支持 / 被拒绝只影响「浏览器承诺保留」，绝不能影响启动（内部已吞掉异常）。
    void requestPersistentStorage();
  }, []);

  // 折叠状态变化就落盘；写入失败（隐私模式）不影响交互。
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // 同上：存不下就算了，不是功能失败。
    }
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      // Ctrl/Cmd+B 切换侧栏折叠（不抢命令面板的 Ctrl/Cmd+K）。
      // 窄屏没有折叠态：按了不改状态，免得用户看不见任何效果却把偏好改了。
      if (key === 'b' && isDesktopLayout()) {
        event.preventDefault();
        setCollapsed((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * 当前打印模板：**唯一来源是 `config.print.template`**。
   *
   * 以前这里是 `paperFor('day', …)` 写死的，导致打印页换模板/换纸只改了 UI，
   * 真正进纸的 `PrintLayer` 还是默认模板 A4。现在 App 解析一次，打印页、
   * 模板编辑器、`PrintLayer` 与二维码都复用同一份结果。
   */
  const paper: PaperId = config?.print.paper ?? 'A4';
  const templateId = config?.print.template ?? DEFAULT_PRINT_TEMPLATE;

  const printTemplate = useMemo(
    () => resolvePrintTemplate(templateId, paper, customTemplates),
    [customTemplates, paper, templateId],
  );

  const blocks = useMemo(
    () => materialize(printTemplate, { date: today, dateLabel: todayLabel(today) }),
    [printTemplate, today],
  );

  const templateChoices = useMemo(() => printTemplateChoices(customTemplates), [customTemplates]);

  /**
   * 预览与打印共用这一份数据（同一个对象），避免"预览是 A5、打印是 A4"这类分叉。
   * 二维码写的是**解析后**的模板 id：模板损坏回退时，纸上的身份也得跟着回退。
   */
  const sheetData = useMemo<SheetData>(
    () => ({
      tasks,
      schedule,
      qr: { templateId: printTemplate.id, date: today, paper },
      habits: activeHabits,
    }),
    [activeHabits, paper, printTemplate.id, schedule, tasks, today],
  );

  const navigate = useCallback((next: ScreenId) => {
    setScreen(next);
    setNotice(null);
  }, []);

  /** 把打印预设写进配置并立刻更新 UI；返回是否写成功。 */
  const applyPrintConfig = useCallback(
    async (patch: { template?: string; paper?: PaperId }): Promise<boolean> => {
      const base = configRef.current;
      if (!base) return false;
      const nextConfig = mergeConfig(base, { print: patch });
      // 先更新 ref：连点两个纸张按钮时，第二次必须基于第一次的结果合并。
      configRef.current = nextConfig;
      try {
        await saveConfig(db, nextConfig);
      } catch (error) {
        // 写库失败不阻塞打印：这次仍按新设置预览/打印，只是刷新后会回到旧值。
        console.warn('打印设置没存下来', error);
      }
      setConfig(nextConfig);
      return true;
    },
    [],
  );

  const changePaper = useCallback(
    (next: PaperId) => {
      void applyPrintConfig({ paper: next });
    },
    [applyPrintConfig],
  );

  const changeTemplate = useCallback(
    (next: string) => {
      void applyPrintConfig({ template: next });
    },
    [applyPrintConfig],
  );

  /**
   * 模板编辑器的「打印这个模板」：先把当前模板 + 当前纸张写进配置，
   * 再等两帧让 `PrintLayer` 用新配置重排，最后才由调用方 `window.print()`。
   *
   * 不等这两帧的话，打印层还是上一张纸——用户看到的就是"打印出来的不是当前模板"。
   */
  const printTemplateSelection = useCallback(
    async (nextTemplateId: string, nextPaper: PaperId): Promise<boolean> => {
      const ok = await applyPrintConfig({ template: nextTemplateId, paper: nextPaper });
      if (!ok) return false;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return true;
    },
    [applyPrintConfig],
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
        // 课表在 App 里算一次（打印层也用），首页直接复用，避免两处各自展开课表。
        return <Home tasks={tasks} schedule={schedule} onNavigate={navigate} />;
      case 'tasks':
        return <Tasks tasks={tasks} />;
      case 'checkin':
        return <CheckinScreen />;
      case 'timetable':
        return <TimetableScreen />;
      case 'templates':
        return (
          <TemplateEditorScreen
            schedule={schedule}
            initialTemplateId={printTemplate.id}
            initialPaper={paper}
            onPrint={printTemplateSelection}
          />
        );
      case 'pomodoro':
        return <Pomodoro />;
      case 'print':
        return (
          <PrintScreen
            blocks={blocks}
            paper={paper}
            tasks={tasks}
            data={sheetData}
            templateId={printTemplate.id}
            templateName={printTemplate.name}
            templates={templateChoices}
            date={today}
            onChangePaper={changePaper}
            onChangeTemplate={changeTemplate}
          />
        );
      case 'capture':
      case 'scan':
        return <ScanScreen onOpenPrint={() => navigate('print')} />;
      case 'mood':
        return <MoodScreen />;
      case 'report':
        return <ReportScreen />;
      case 'checklist':
        return <ChecklistScreen />;
      case 'diary':
        return <DiaryScreen />;
      case 'data':
        return <DataScreen onNotice={setNotice} />;
      case 'mind':
        return <ToolboxScreen />;
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
          collapsed={collapsed}
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

            {/*
              折叠按钮放在 header 而不是侧栏里：侧栏折叠后只剩 56px，
              把开关塞进去会跟图标列抢位置；放在紧邻侧栏的位置（内容区左上角）也符合直觉。
            */}
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="hidden rounded-md border border-black/10 px-2 py-1 text-xs opacity-60 transition hover:opacity-100 md:inline-flex"
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              title={`${collapsed ? '展开侧栏' : '折叠侧栏'}（Ctrl/⌘ + B）`}
            >
              {collapsed ? '»' : '«'}
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

          <BackupBanner reminderDays={config.backup.reminderDays} />

          <div className="min-w-0 flex-1 px-4 py-6 break-words md:px-8">
            {/*
              按页包一层边界：单页渲染崩溃时只显示错误卡片，
              导航、命令面板、打印层都还在（AGENTS 规则 10）。
              resetKey 用 screen，切页自动解除错误，不会把人困在错误页。
            */}
            <ScreenBoundary resetKey={screen}>{body}</ScreenBoundary>
          </div>
        </div>
      </div>

      {/* 打印层必须在 .screen-only 之外，否则打印时被一起隐藏成白纸 */}
      <PrintLayer blocks={blocks} paper={paper} data={sheetData} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        aria-label="导入数据文件"
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
