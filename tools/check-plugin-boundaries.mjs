import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 构建期插件的数据边界：
 * - 插件不得直接 import `@gofor/store`；
 * - 只能通过 `@gofor/plugin-kit/store` / host.store 访问，宿主按 pluginId 授权。
 *
 * 这是构建期检查；运行期由 `createPluginStore` 的 allowlist 兜底。
 */
const ROOT = new URL('../plugins/', import.meta.url);
const FORBIDDEN = /from\s+['"]@gofor\/store['"]|import\(\s*['"]@gofor\/store['"]\s*\)/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && entry.name !== 'external-entry.ts') {
      files.push(path);
    }
  }
  return files;
}

const files = await walk(ROOT.pathname);
const violations = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (FORBIDDEN.test(text)) violations.push(file);
}

if (violations.length > 0) {
  console.error('构建期插件直接 import @gofor/store，必须改走 host.store：');
  for (const file of violations) console.error(`  - ${file}`);
  process.exit(1);
}
console.log(`插件数据边界通过：${files.length} 个文件未直接 import @gofor/store`);
