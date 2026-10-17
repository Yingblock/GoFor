import type {
  Checkin,
  StoredTemplate,
  StoredTimetable,
  StudySession,
  Subject,
  TagPool,
  Task,
} from '@gofor/core/domain';
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
  }
}

export const db = new GoForDb();
