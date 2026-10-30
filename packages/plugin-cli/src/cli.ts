#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPlugin, listPlugins, removePlugin } from './commands.js';
import { defaultUserDataDir } from './paths.js';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const consoleIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

const USAGE = `用法：
  gofor plugin add <gofor-plugin-包名> [--user-data <dir>]
  gofor plugin remove <gofor-plugin-包名> [--user-data <dir>]
  gofor plugin list [--user-data <dir>]

说明：
  add     在 userData/plugins 执行 pnpm add，并写入 gofor.plugins.json 的 enabled
  remove  执行 pnpm remove，并从 enabled 删除（不删插件数据）
  list    列出已安装与启用状态

  改完 enabled 后需要重启 GoFor，或在应用内调用 reloadPlugins()。`;

interface ParsedArgs {
  userDataDir: string;
  positional: string[];
}

function parseArgs(argv: readonly string[], io: CliIo, env: NodeJS.ProcessEnv): ParsedArgs | null {
  const positional: string[] = [];
  let userDataDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--user-data') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        io.err('--user-data 需要一个目录参数');
        return null;
      }
      userDataDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--user-data=')) {
      const value = arg.slice('--user-data='.length);
      if (value === '') {
        io.err('--user-data 需要一个目录参数');
        return null;
      }
      userDataDir = value;
      continue;
    }
    positional.push(arg);
  }

  return {
    userDataDir: userDataDir ?? defaultUserDataDir({ env }),
    positional,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function formatList(
  pluginsDir: string,
  packages: ReturnType<typeof listPlugins>['packages'],
): string[] {
  const lines = [`插件目录：${pluginsDir}`];
  if (packages.length === 0) {
    lines.push('（还没有安装插件）');
    return lines;
  }
  lines.push(`${pad('启用', 6)}${pad('包名', 32)}${pad('版本', 10)}id`);
  for (const item of packages) {
    lines.push(
      `${pad(item.enabled ? '✓' : '-', 6)}${pad(item.packageName, 32)}${pad(item.version, 10)}${item.id ?? '（缺 gofor 清单）'}`,
    );
  }
  return lines;
}

/** 纯函数入口，测试直接调；`process.exitCode` 由文件末尾的 main 分支设置。 */
export function runCli(
  argv: readonly string[],
  io: CliIo = consoleIo,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    io.out(USAGE);
    return argv.length === 0 ? 2 : 0;
  }

  const parsed = parseArgs(argv, io, env);
  if (!parsed) return 2;
  const { userDataDir, positional } = parsed;

  if (positional[0] !== 'plugin') {
    io.err(`未知命令：${positional[0] ?? ''}\n\n${USAGE}`);
    return 2;
  }

  const subcommand = positional[1];
  const packageName = positional[2];

  if (subcommand === 'list') {
    const result = listPlugins(userDataDir);
    for (const line of formatList(result.pluginsDir, result.packages)) io.out(line);
    return 0;
  }

  if (subcommand === 'add') {
    if (packageName === undefined) {
      io.err('gofor plugin add 需要一个包名');
      return 2;
    }
    try {
      const result = addPlugin(packageName, { userDataDir });
      io.out(`已安装 ${result.packageName}（${result.pluginsDir}）`);
      io.out(`已启用：${result.enabled.join(', ')}`);
      io.out('重启 GoFor，或在应用内调用 reloadPlugins() 使插件生效。');
      return 0;
    } catch (error) {
      io.err(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (subcommand === 'remove') {
    if (packageName === undefined) {
      io.err('gofor plugin remove 需要一个包名');
      return 2;
    }
    try {
      const result = removePlugin(packageName, { userDataDir });
      io.out(`已移除 ${result.packageName}（${result.pluginsDir}）`);
      io.out(`当前启用：${result.enabled.length === 0 ? '（无）' : result.enabled.join(', ')}`);
      io.out('重启 GoFor，或在应用内调用 reloadPlugins() 使变更生效。插件数据未删除。');
      return 0;
    } catch (error) {
      io.err(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  io.err(`未知子命令：${subcommand ?? ''}\n\n${USAGE}`);
  return 2;
}

function isEntryPoint(): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    // pnpm 的 bin shim 走 node_modules/@gofor/plugin-cli 软链；Node 对 ESM 默认解析真实路径，
    // 所以 import.meta.url 与 argv[1] 必须都 realpath 后再比。
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(script));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = runCli(process.argv.slice(2));
}
