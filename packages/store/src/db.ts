import type {
  Checkin,
  Checklist,
  ChecklistLog,
  CourseNote,
  DiaryEntry,
  HabitLog,
  MoodLog,
  ScanBatch,
  SheetManifestRecord,
  StoredTemplate,
  StoredTimetable,
  StudySession,
  Subject,
  TagPool,
  Task,
  ToolboxRun,
} from '@gofor/core/domain';
import type { Habit } from '@gofor/core/habits';
import type { PomodoroRun } from '@gofor/core/pomodoro';
import Dexie, { type Table } from 'dexie';

/** 配置在库里只有一行：key = 'app'，value 是序列化后的 AppConfig。 */
export interface ConfigRow {
  key: string;
  value: string;
  updatedAt: number;
}

/**
 * 本地数据库。
 *
 * 版本历史只在这里维护，别处不许改。Dexie 靠版本号决定跑不跑升级函数，
 * 而升级函数一旦写错会**删库或卡死**。原则：
 *
 * **升级只加表与索引，不迁移已有数据。** 需要改数据形状时，宁可加可空字段。
 */
export class GoForDb extends Dexie {
  config!: Table<ConfigRow, string>;
  tasks!: Table<Task, string>;
  subjects!: Table<Subject, string>;
  sessions!: Table<StudySession, string>;
  templates!: Table<StoredTemplate, string>;
  focusRuns!: Table<PomodoroRun, string>;
  checkins!: Table<Checkin, string>;
  timetables!: Table<StoredTimetable, string>;
  tagPools!: Table<TagPool, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  moodLogs!: Table<MoodLog, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  toolboxRuns!: Table<ToolboxRun, string>;
  checklists!: Table<Checklist, string>;
  checklistLogs!: Table<ChecklistLog, string>;
  scanBatches!: Table<ScanBatch, string>;
  sheetManifests!: Table<SheetManifestRecord, string>;
  courseNotes!: Table<CourseNote, string>;

  constructor(name = 'gofor') {
    super(name);

    this.version(1).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    });

    // v2：番茄钟运行态 + 每日打卡。
    // 只加表，不动任何已有数据。
    this.version(2).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
      focusRuns: 'id, status, createdAt',
      checkins: 'date',
      timetables: 'id',
    });

    // v3：标签池。
    //
    // 为什么必须新开一个版本而不是塞进 v2：Dexie 只按版本号决定跑不跑升级函数。
    // 已经停在 v2 的浏览器库不会因为"v2 的 stores 里多写了一行"而补建表，
    // 结果就是 `listTagPools` 直接报「表不存在」。只要发布过，版本就冻结了。
    this.version(3).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
      focusRuns: 'id, status, createdAt',
      checkins: 'date',
      timetables: 'id',
      tagPools: 'id',
    });

    // v4：多个打卡项 + 每项的历史。
    //
    // 旧的 `checkins` 是"一天一个布尔"，无法表达多个习惯与重复规则。
    // 升级时把已有记录迁移成一条名为「学习」的默认习惯，避免用户数据凭空消失。
    this.version(4)
      .stores({
        config: 'key',
        tasks: 'id, done, due, subjectId, sortKey',
        subjects: 'id, order',
        sessions: 'id, date, subjectId',
        templates: 'id, name',
        focusRuns: 'id, status, createdAt',
        checkins: 'date',
        timetables: 'id',
        tagPools: 'id',
        habits: 'id, order',
        habitLogs: 'id, habitId, date',
      })
      .upgrade(async (tx) => {
        const checkins = (await tx.table('checkins').toArray()) as Checkin[];
        if (checkins.length === 0) return;

        const doneDates = checkins
          .filter((row) => row.done)
          .map((row) => row.date)
          .sort();
        if (doneDates.length === 0) return;

        await tx.table('habits').put({
          id: 'habit-default',
          name: '学习',
          weekdays: [],
          startDate: doneDates[0],
          endDate: null,
          order: 0,
          createdAt: Date.now(),
        });
        for (const date of doneDates) {
          await tx.table('habitLogs').put({
            id: `habit-default@${date}`,
            habitId: 'habit-default',
            date,
            done: true,
            updatedAt: Date.now(),
          });
        }
      });

    // v5：P2「纸的回流 + 行为层」的新表。
    //
    // 只加表、不动任何已有数据，所以没有 upgrade 函数。
    // 三滑块/日记/工具箱/清单/扫描批次都是新功能，旧库里不存在这些记录。
    this.version(5).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
      focusRuns: 'id, status, createdAt',
      checkins: 'date',
      timetables: 'id',
      tagPools: 'id',
      habits: 'id, order',
      habitLogs: 'id, habitId, date',
      moodLogs: 'date',
      diaryEntries: 'id, date',
      toolboxRuns: 'id, exercise, startedAt',
      checklists: 'id',
      checklistLogs: 'id, date, checklistId',
      scanBatches: 'id, status, createdAt',
    });

    // v6：打印时的坐标清单快照。
    //
    // v5 已经在本机跑过（e2e 会建库），所以**不能**往 v5 的 stores 里补表——
    // Dexie 只按版本号决定跑不跑升级，停在 v5 的库不会补建。
    this.version(6).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
      focusRuns: 'id, status, createdAt',
      checkins: 'date',
      timetables: 'id',
      tagPools: 'id',
      habits: 'id, order',
      habitLogs: 'id, habitId, date',
      moodLogs: 'date',
      diaryEntries: 'id, date',
      toolboxRuns: 'id, exercise, startedAt',
      checklists: 'id',
      checklistLogs: 'id, date, checklistId',
      scanBatches: 'id, status, createdAt',
      sheetManifests: 'id, date, templateId',
    });

    // v7：每日课程备注（P2-2.15）。键含日期与节次，备注只属于那一天。
    this.version(7).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
      focusRuns: 'id, status, createdAt',
      checkins: 'date',
      timetables: 'id',
      tagPools: 'id',
      habits: 'id, order',
      habitLogs: 'id, habitId, date',
      moodLogs: 'date',
      diaryEntries: 'id, date',
      toolboxRuns: 'id, exercise, startedAt',
      checklists: 'id',
      checklistLogs: 'id, date, checklistId',
      scanBatches: 'id, status, createdAt',
      sheetManifests: 'id, date, templateId',
      courseNotes: 'id, date',
    });
  }
}

export const db = new GoForDb();
