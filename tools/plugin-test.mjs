// 删除插件目录后的构建入口：先同步注册表，再直接调 Vite。
//
// 不能走 `pnpm build`：pnpm 在任何 script 之前会校验 workspace 依赖，删掉
// plugins/<name> 后会先报 "no package named ..." 而根本轮不到 prebuild。
// 这里用纯 node + Vite 二进制，绕开 pnpm 的依赖校验。

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

// 1. 按现有 plugins/* 目录重写 @gofor/plugins 的 index 与依赖。
run(process.execPath, [join(ROOT, 'tools', 'sync-plugin-registry.mjs')]);

// 2. 直接调 Vite，避免 pnpm 在 script 前尝试重装缺失的 workspace 包。
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
