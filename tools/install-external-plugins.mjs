import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

const argIndex = process.argv.indexOf('--user-data');
const env = process.env.GOFOR_USER_DATA;
const userData =
  argIndex >= 0
    ? process.argv[argIndex + 1]
    : env && env.trim() !== ''
      ? env
      : process.platform === 'win32'
        ? win32.join(process.env.APPDATA ?? win32.join(homedir(), 'AppData', 'Roaming'), 'GoFor')
        : process.platform === 'darwin'
          ? join(homedir(), 'Library', 'Application Support', 'GoFor')
          : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'GoFor');

const sourceRoot = join(process.cwd(), 'external-plugins');
if (!existsSync(sourceRoot)) {
  console.error('先运行 pnpm plugins:build');
  process.exit(1);
}
const pluginsRoot = join(userData, 'plugins');
const modulesRoot = join(pluginsRoot, 'node_modules');
await mkdir(modulesRoot, { recursive: true });

const packages = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const pkg of packages) {
  await cp(join(sourceRoot, pkg), join(modulesRoot, pkg), { recursive: true });
}

const manifestPath = join(pluginsRoot, 'gofor.plugins.json');
let enabled = [];
try {
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (Array.isArray(parsed.enabled)) enabled = parsed.enabled.filter((id) => typeof id === 'string');
} catch {
  enabled = [];
}
for (const pkg of packages) {
  try {
    const json = JSON.parse(await readFile(join(sourceRoot, pkg, 'package.json'), 'utf8'));
    if (typeof json.gofor?.id === 'string' && !enabled.includes(json.gofor.id)) {
      enabled.push(json.gofor.id);
    }
  } catch {
    // 忽略坏包；plugin-host 启动时会显示状态
  }
}
await writeFile(manifestPath, `${JSON.stringify({ enabled }, null, 2)}\n`);
console.log(`已安装 ${packages.length} 个外部插件到 ${modulesRoot}`);
console.log(`gofor.plugins.json enabled: ${enabled.join(', ')}`);
