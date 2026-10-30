import { spawnSync } from 'node:child_process';

/** 在插件目录执行 pnpm 的抽象；测试用它替换成假实现。返回退出码。 */
export type PnpmRunner = (args: readonly string[], cwd: string) => number;

/**
 * 默认实现：`pnpm add <pkg>` / `pnpm remove <pkg>`，cwd 是 `userData/plugins`。
 *
 * 不走 shell（Windows 的 .cmd 需要 shell，单独处理）。插件安装脚本会执行，
 * 这是 npm/pnpm 的既有语义；信任模型见 `docs/PLUGINS.md`。
 */
export const runPnpm: PnpmRunner = (args, cwd) => {
  const result = spawnSync('pnpm', [...args], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};
