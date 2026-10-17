import type { StoredTemplate, StudySession, Subject, Task } from '@gofor/core/domain';
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
 * 为什么 schema 版本要显式写死并集中在一处：Dexie 靠版本号决定跑不跑升级函数，
 * 而升级函数一旦写错会**删库或卡死**。所以版本历史只在这里维护，别处不许改。
 */
export class GoForDb extends Dexie {
  config!: Table<ConfigRow, string>;
  tasks!: Table<Task, string>;
  subjects!: Table<Subject, string>;
  sessions!: Table<StudySession, string>;
  templates!: Table<StoredTemplate, string>;

  constructor(name = 'gofor') {
    super(name);
    this.version(1).stores({
      config: 'key',
      tasks: 'id, done, due, subjectId, sortKey',
      subjects: 'id, order',
      sessions: 'id, date, subjectId',
      templates: 'id, name',
    });
  }
}

export const db = new GoForDb();
