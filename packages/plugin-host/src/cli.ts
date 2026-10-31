#!/usr/bin/env node
import { defaultUserDataDir } from './paths.js';
import { startPluginHost } from './server.js';

function usage(): never {
  console.error(`用法：
  gofor-plugin-host [--host 0.0.0.0] [--port 47822] [--user-data <dir>] [--allow-lan]

阶段一：默认绑 0.0.0.0，但只响应 loopback；--allow-lan 为后续鉴权/适配预留。`);
  process.exit(2);
}

function parse(argv: readonly string[]): {
  host: string;
  port: number;
  userDataDir: string;
  allowLan: boolean;
} {
  let host = '0.0.0.0';
  let port = 47822;
  let userDataDir = defaultUserDataDir();
  let allowLan = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') host = argv[++index] ?? usage();
    else if (arg === '--port') port = Number(argv[++index] ?? usage());
    else if (arg === '--user-data') userDataDir = argv[++index] ?? usage();
    else if (arg === '--allow-lan') allowLan = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('gofor-plugin-host：阶段一仅绑定 + 只读插件接口');
      process.exit(0);
    } else usage();
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) usage();
  return { host, port, userDataDir, allowLan };
}

const options = parse(process.argv.slice(2));
const host = await startPluginHost(options);
console.log(`[plugin-host] ${host.origin}（bind ${options.host}:${options.port}）`);
console.log('[plugin-host] 阶段一：LAN 请求默认 403；数据层未接入');

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[plugin-host] ${signal}，正在关闭…`);
  await host.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
