import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type PluginLogLevel = 'info' | 'warn' | 'error';

/** 宿主注入的日志口。加载器只调用它，不直接决定日志去哪。 */
export interface PluginLogger {
  log(level: PluginLogLevel, message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface FileLoggerOptions {
  /** 同时写 console；默认 true（Electron 主进程控制台仍可看）。 */
  console?: boolean;
  /** 注入时钟，便于测试。 */
  now?: () => number;
}

function formatDetail(detail: unknown): string {
  if (detail === undefined) return '';
  if (detail instanceof Error) return ` ${detail.stack ?? `${detail.name}: ${detail.message}`}`;
  if (typeof detail === 'string') return ` ${detail}`;
  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ' [unserializable detail]';
  }
}

/**
 * 追加写 `userData/logs/plugins.log`。
 *
 * 写日志本身**永远不能**让加载失败：磁盘满、目录只读都只吞掉错误。
 * 用同步 append 是有意的——插件加载量很小，异步队列反而会丢最后几行。
 */
export function createFileLogger(filePath: string, options: FileLoggerOptions = {}): PluginLogger {
  const toConsole = options.console ?? true;
  const now = options.now ?? Date.now;
  let directoryReady = false;

  const write = (level: PluginLogLevel, message: string, detail?: unknown): void => {
    const line = `[${new Date(now()).toISOString()}] [${level}] ${message}${formatDetail(detail)}\n`;
    try {
      if (!directoryReady) {
        mkdirSync(dirname(filePath), { recursive: true });
        directoryReady = true;
      }
      appendFileSync(filePath, line, 'utf8');
    } catch {
      // 日志失败不能影响插件加载；控制台那一路还在。
    }
    if (!toConsole) return;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(line.trimEnd());
  };

  return {
    log: write,
    info: (message, detail) => write('info', message, detail),
    warn: (message, detail) => write('warn', message, detail),
    error: (message, detail) => write('error', message, detail),
  };
}

/** 测试/宿主可以传这个来彻底静音。 */
export const silentLogger: PluginLogger = {
  log: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
