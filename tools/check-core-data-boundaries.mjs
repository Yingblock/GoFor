import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * core/app 也不得直接读插件私有数据。
 *
 * 唯一允许的入口：
 * - apps/web/src/plugins/pluginStore.ts（broker）
 * - apps/web/src/plugins/host.tsx（provider 注册）
 *
 * 例外：DataScreen/backup 通过 exportAll/importAll 备份全部数据（用户显式操作）。
 */
const ROOT = join(process.cwd(), 'apps/web/src');
const ALLOW = new Set(['plugins/pluginStore.ts', 'plugins/host.tsx']);
const FORBIDDEN = [
  'listTasks',
  'listHabits',
  'listHabitLogs',
  'listMoodLogs',
  'listDiaryEntries',
  'listChecklists',
  'listChecklistLogs',
  'listToolboxRuns',
  'loadTimetable',
  'listCourseNotesByDate',
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = await walk(ROOT);
const violations = [];
for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  if (ALLOW.has(rel)) continue;
  const text = await readFile(file, 'utf8');
  const hits = FORBIDDEN.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (hits.length > 0) violations.push({ file: rel, hits });
}
if (violations.length > 0) {
  console.error('core/app 直接读取插件私有数据，必须走 host.data / provider：');
  for (const v of violations) console.error(`  - ${v.file}: ${v.hits.join(', ')}`);
  process.exit(1);
}
console.log(`core 数据边界通过：${files.length} 个文件未直接读插件私有表`);
