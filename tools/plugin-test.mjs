// 删除插件目录后的构建入口：直接调 Vite，不经过 pnpm 的 workspace 依赖预校验。
//
// 注册表本身由 Vite 的 import.meta.glob 扫描 plugins/*，删目录即可自动消失。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP_DIR = join(ROOT, 'apps', 'web');
const VITE_BIN = join(APP_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(VITE_BIN)) {
  console.error(
    '缺少 apps/web/node_modules/vite。请先在完整目录（删除插件之前）运行一次 `pnpm install`。',
  );
  process.exit(2);
}

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [VITE_BIN, 'build'], APP_DIR);

const port = process.env.PORT ?? '4174';
console.log(`\n构建完成。预览：`);
console.log(
  `  cd apps/web && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port}`,
);
console.log(`如果要继续用 4173，先停掉 gofor-preview，再把 PORT 设为 4173 并加 --preview。`);

if (process.argv.includes('--preview')) {
  run(
    process.execPath,
    [VITE_BIN, 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'],
    APP_DIR,
  );
}
