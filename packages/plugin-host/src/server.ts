import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import {
  createFileLogger,
  type PluginLogger,
  PluginManager,
  type PluginSnapshot,
  type TaskStore,
} from '@gofor/plugin-runtime';

export interface PluginHostOptions {
  userDataDir: string;
  /** 默认 0.0.0.0：先绑定，方便后续 LAN 适配。 */
  host?: string;
  /** 默认 47822。 */
  port?: number;
  /**
   * 阶段一：即使绑 0.0.0.0，也只处理 loopback 请求；LAN 一律 403。
   * 后续做鉴权/适配时再打开。
   */
  allowLan?: boolean;
  logger?: PluginLogger;
}

export interface PluginHost {
  server: Server;
  manager: PluginManager;
  /** 实际监听地址（port=0 时是系统分配端口）。 */
  origin: string;
  close(): Promise<void>;
}

const PACKAGE_NAME = /^gofor-plugin-[a-z0-9][a-z0-9-]*$/;

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Node 的 remoteAddress 可能是 IPv4-mapped IPv6。 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address.startsWith('127.') ||
    address === '::ffff:127.0.0.1'
  );
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

const unsupportedTaskStore: TaskStore = {
  async getTasks() {
    throw new Error('插件宿主数据层尚未接入（阶段一：仅绑定与只读 snapshot）');
  },
  async updateTask() {
    throw new Error('插件宿主数据层尚未接入（阶段一：仅绑定与只读 snapshot）');
  },
};

function json(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  response.end(text);
}

function text(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('请求体超过 64KB');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function servePluginAsset(response: ServerResponse, pluginsRoot: string, pathname: string): void {
  const match = /^\/plugins\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match) {
    text(response, 404, 'not found');
    return;
  }
  const packageName = decodeURIComponent(match[1] ?? '');
  const relative = decodeURIComponent(match[2] ?? '');
  if (!PACKAGE_NAME.test(packageName)) {
    text(response, 400, 'bad package name');
    return;
  }
  const packageRoot = resolve(pluginsRoot, packageName);
  const filePath = resolve(packageRoot, relative);
  if (!filePath.startsWith(`${packageRoot}${sep}`)) {
    text(response, 403, 'forbidden');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    text(response, 404, 'not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(response);
}

/**
 * 本地插件宿主（阶段一）。
 *
 * - 绑定 0.0.0.0:47822，为后续手机 LAN 访问留位置；
 * - 默认只响应 loopback，LAN 请求 403（还没有鉴权/适配）；
 * - 不接数据层：getTasks/updateTask 目前明确报未接入；
 * - 已提供 snapshot / reload / run-command / renderer 资源，供后续 PWA 客户端。
 */
function findPackageByPluginId(userDataDir: string, pluginId: string): string | null {
  const root = join(userDataDir, 'plugins', 'node_modules');
  if (!existsSync(root)) return null;
  for (const name of readdirSync(root)) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(root, name, 'package.json'), 'utf8'),
      ) as { gofor?: { id?: unknown } };
      if (manifest.gofor?.id === pluginId) return name;
    } catch {
      // 忽略坏包
    }
  }
  return null;
}

export async function startPluginHost(options: PluginHostOptions): Promise<PluginHost> {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 47822;
  const allowLan = options.allowLan ?? false;
  const pluginsRoot = join(options.userDataDir, 'plugins', 'node_modules');
  const logger =
    options.logger ?? createFileLogger(join(options.userDataDir, 'logs', 'plugin-host.log'));

  const manager = new PluginManager({
    userDataDir: options.userDataDir,
    taskStore: unsupportedTaskStore,
    logger,
  });

  const server = createServer((request, response) => {
    void (async () => {
      const remote = request.socket.remoteAddress;
      if (!allowLan && !isLoopbackAddress(remote)) {
        text(response, 403, 'LAN access is disabled in phase 1');
        return;
      }

      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      // PWA 在 4173、宿主在 47822，属于跨 origin；renderer 动态 import 需要 CORS。
      const origin = request.headers.origin;
      if (origin !== undefined && isAllowedOrigin(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === 'GET' && pathname === '/health') {
        json(response, 200, {
          ok: true,
          bind: `${host}:${port}`,
          allowLan,
          pluginsDir: join(options.userDataDir, 'plugins'),
          note: allowLan ? 'LAN enabled' : 'phase 1: loopback only',
        });
        return;
      }

      if (request.method === 'GET' && pathname === '/api/plugins/snapshot') {
        json(response, 200, manager.snapshot());
        return;
      }

      // 已安装（包括被禁用）插件：刷新后仍能在插件目录里重新启用。
      if (request.method === 'GET' && pathname === '/api/plugins/installed') {
        const pluginsRoot = join(options.userDataDir, 'plugins', 'node_modules');
        const active = new Set(
          manager
            .snapshot()
            .plugins.filter((plugin) => plugin.state === 'active')
            .map((plugin) => plugin.packageName),
        );
        const installed: unknown[] = [];
        if (existsSync(pluginsRoot)) {
          for (const packageName of readdirSync(pluginsRoot)) {
            try {
              const manifest = JSON.parse(
                readFileSync(join(pluginsRoot, packageName, 'package.json'), 'utf8'),
              ) as {
                gofor?: {
                  id?: unknown;
                  displayName?: unknown;
                  version?: unknown;
                  capabilities?: unknown;
                  permissions?: unknown;
                  renderer?: unknown;
                  provides?: { printBlocks?: unknown };
                };
              };
              const gofor = manifest.gofor;
              if (typeof gofor?.id !== 'string') continue;
              installed.push({
                id: gofor.id,
                packageName,
                displayName:
                  typeof gofor.displayName === 'string' ? gofor.displayName : gofor.id,
                version: typeof gofor.version === 'string' ? gofor.version : '0.0.0',
                capabilities: Array.isArray(gofor.capabilities) ? gofor.capabilities : [],
                permissions: Array.isArray(gofor.permissions) ? gofor.permissions : [],
                renderer: typeof gofor.renderer === 'string' ? gofor.renderer : null,
                printBlocks: Array.isArray(gofor.provides?.printBlocks)
                  ? gofor.provides.printBlocks
                  : [],
                enabled: active.has(packageName),
              });
            } catch {
              // 忽略坏包
            }
          }
        }
        json(response, 200, { plugins: installed });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/plugins/enable') {
        const body = await readJson(request);
        if (
          typeof body !== 'object' ||
          body === null ||
          typeof (body as { id?: unknown }).id !== 'string' ||
          typeof (body as { enabled?: unknown }).enabled !== 'boolean'
        ) {
          json(response, 400, { ok: false, error: '需要 { id: string, enabled: boolean }' });
          return;
        }
        const id = (body as { id: string }).id;
        const enabled = (body as { enabled: boolean }).enabled;
        const explicitPackage =
          typeof (body as { packageName?: unknown }).packageName === 'string'
            ? (body as { packageName: string }).packageName
            : null;
        const packageName =
          explicitPackage ??
          manager.snapshot().plugins.find((plugin) => plugin.id === id)?.packageName ??
          findPackageByPluginId(options.userDataDir, id) ??
          id;
        const manifestPath = join(options.userDataDir, 'plugins', 'gofor.plugins.json');
        let current: { enabled?: unknown } = {};
        try {
          current = JSON.parse(readFileSync(manifestPath, 'utf8')) as { enabled?: unknown };
        } catch {
          current = {};
        }
        const list = Array.isArray(current.enabled)
          ? current.enabled.filter((item): item is string => typeof item === 'string')
          : [];
        const next = enabled
          ? [...new Set([...list, packageName])]
          : list.filter((item) => item !== packageName);
        writeFileSync(manifestPath, `${JSON.stringify({ enabled: next }, null, 2)}\n`);
        const snapshot = await manager.reloadPlugins();
        json(response, 200, { ok: true, enabled: next, snapshot });
        return;
      }

      if (request.method === 'POST' && pathname === '/api/plugins/reload') {
        json(response, 200, await manager.reloadPlugins());
        return;
      }

      if (request.method === 'POST' && pathname === '/api/plugins/run-command') {
        const body = await readJson(request);
        const id =
          typeof body === 'object' && body !== null && 'id' in body
            ? (body as { id?: unknown }).id
            : undefined;
        if (typeof id !== 'string' || id.trim() === '') {
          json(response, 400, { ok: false, error: 'id 必须是非空字符串' });
          return;
        }
        json(response, 200, await manager.runCommand(id));
        return;
      }

      if (request.method === 'GET' && pathname.startsWith('/plugins/')) {
        servePluginAsset(response, pluginsRoot, pathname);
        return;
      }

      text(response, 404, 'not found');
    })().catch((error: unknown) => {
      logger.error('plugin-host 请求失败', error);
      if (!response.headersSent) json(response, 500, { error: 'internal error' });
      else response.end();
    });
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolvePromise());
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  const snapshot: PluginSnapshot = await manager.loadAll();

  logger.info(
    `plugin-host 已启动 ${host}:${actualPort}；插件 ${snapshot.plugins.length} 个；` +
      (allowLan ? '允许 LAN' : '阶段一仅 loopback'),
  );

  return {
    server,
    manager,
    origin: `http://127.0.0.1:${actualPort}`,
    close: async () => {
      await manager.dispose();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}
