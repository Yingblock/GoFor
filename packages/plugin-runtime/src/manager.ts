import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type {
  GoForPluginAPI,
  GoForPluginModule,
  PluginCapability,
  PluginCommand,
  PluginManifest,
  PluginStatus,
  Task,
} from '@gofor/contracts';
import { createFileLogger, type PluginLogger } from './logger.js';
import { parsePluginManifest, resolveInsidePackage, SUPPORTED_API_VERSION } from './manifest.js';
import type {
  PluginSnapshot,
  RegisteredPrintTemplate,
  RunCommandResult,
  TaskStore,
} from './types.js';

export const PLUGINS_DIR_NAME = 'plugins';
export const PLUGINS_MANIFEST_FILE = 'gofor.plugins.json';
export const DEFAULT_ACTIVATE_TIMEOUT_MS = 5000;

export interface PluginManagerOptions {
  /** 等价于 Electron 的 `app.getPath('userData')`。 */
  userDataDir: string;
  /** 宿主注入的任务仓储；插件 API 的 getTasks/updateTask 走这里。 */
  taskStore: TaskStore;
  /** 默认写 `<userData>/logs/plugins.log`。 */
  logger?: PluginLogger;
  /** activate/deactivate 超时；默认 5000ms。 */
  timeoutMs?: number;
  now?: () => number;
}

interface RegisteredCommand extends PluginCommand {
  pluginId: string;
  packageName: string;
}

interface RegisteredSlot {
  slotId: string;
  pluginId: string;
  packageName: string;
  /** manifest.gofor.renderer 的相对路径，供渲染进程拼 URL。 */
  renderer: string | null;
  componentName: string;
  component: unknown;
}

interface LoadedPlugin {
  packageName: string;
  manifest: PluginManifest;
  module: GoForPluginModule;
  api: GoForPluginAPI;
  collected: Collected;
}

/**
 * activate 期间的暂存区。
 *
 * 只有 activate 成功返回才合并进全局注册表：超时/抛错的插件不会留下
 * 半截命令或插槽（`active = false` 后迟到的注册忽略并记日志）。
 */
interface Collected {
  active: boolean;
  commands: RegisteredCommand[];
  slots: RegisteredSlot[];
  templates: RegisteredPrintTemplate[];
}

function createCollected(): Collected {
  return { active: true, commands: [], slots: [], templates: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message || error.name : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

function componentExportName(component: unknown): string {
  if (typeof component === 'function') return component.name || 'default';
  if (isRecord(component)) {
    const name = component.displayName ?? component.name;
    if (typeof name === 'string' && name.trim() !== '') return name;
  }
  return 'default';
}

function normalizePluginModule(raw: unknown, packageName: string): GoForPluginModule {
  const candidates: unknown[] = [raw];
  if (isRecord(raw)) candidates.push(raw.default);
  for (const candidate of candidates) {
    if (isRecord(candidate) && typeof candidate.activate === 'function') {
      return candidate as unknown as GoForPluginModule;
    }
  }
  throw new Error(`${packageName} 的入口没有导出 activate(api)`);
}

export class PluginTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginTimeoutError';
  }
}

/** `Promise.race` + 定时器；超时后原任务仍在跑，但调用方已经拿到失败。 */
export async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PluginTimeoutError(message)), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 运行时插件加载器（主进程侧）。
 *
 * 生命周期：`loadAll()` → `reloadPlugins()` → `dispose()`。
 * 每个插件独立 try/catch；单个失败只影响它自己的 `PluginStatus`。
 */
export class PluginManager {
  readonly pluginsDir: string;
  readonly manifestPath: string;
  readonly logPath: string;

  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly logger: PluginLogger;
  private readonly taskStore: TaskStore;
  private readonly pluginRequire: NodeRequire;

  private readonly loaded = new Map<string, LoadedPlugin>();
  private readonly statuses = new Map<string, PluginStatus>();
  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly templates = new Map<string, RegisteredPrintTemplate>();
  private slots: RegisteredSlot[] = [];
  private version = 0;

  constructor(options: PluginManagerOptions) {
    this.pluginsDir = join(options.userDataDir, PLUGINS_DIR_NAME);
    this.manifestPath = join(this.pluginsDir, PLUGINS_MANIFEST_FILE);
    this.logPath = join(options.userDataDir, 'logs', 'plugins.log');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_ACTIVATE_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.taskStore = options.taskStore;
    this.logger = options.logger ?? createFileLogger(this.logPath, { now: this.now });
    // 用 plugins/package.json 作为解析基准：插件依赖就装在这个目录。
    this.pluginRequire = createRequire(join(this.pluginsDir, 'package.json'));
  }

  /** 启动时调用：重新读清单并加载。重复调用等价于 reload。 */
  async loadAll(): Promise<PluginSnapshot> {
    await this.unloadAll();
    const enabled = this.readEnabledPluginNames();
    this.logger.info(`插件启动：enabled ${enabled.length} 个`, enabled);
    for (const packageName of enabled) {
      await this.loadOne(packageName);
    }
    this.bumpVersion();
    return this.snapshot();
  }

  /** 开发时热重载：卸载旧插件（调 deactivate）→ 重读清单 → 重新加载。 */
  async reloadPlugins(): Promise<PluginSnapshot> {
    this.logger.info('reloadPlugins()');
    return await this.loadAll();
  }

  /** 卸载全部已激活插件，清空注册表。失败只记日志，不向外抛。 */
  async unloadAll(): Promise<void> {
    const entries = [...this.loaded.values()].reverse();
    for (const entry of entries) {
      entry.collected.active = false;
      try {
        if (entry.module.deactivate) {
          await withTimeout(
            Promise.resolve(entry.module.deactivate(entry.api)),
            this.timeoutMs,
            `deactivate 超过 ${this.timeoutMs}ms`,
          );
        }
        this.logger.info(`插件 ${entry.manifest.id} 已卸载`);
      } catch (error) {
        this.logger.warn(`插件 ${entry.manifest.id} deactivate 失败（继续卸载）`, error);
      }
    }
    this.loaded.clear();
    this.commands.clear();
    this.templates.clear();
    this.slots = [];
    this.statuses.clear();
    this.bumpVersion();
  }

  /** 当前状态快照；IPC 与调试面板共用。 */
  snapshot(): PluginSnapshot {
    return {
      version: this.version,
      plugins: [...this.statuses.values()].map((status) => ({
        ...status,
        capabilities: [...status.capabilities],
      })),
      slots: this.slots.map((slot) => ({
        slotId: slot.slotId,
        pluginId: slot.pluginId,
        packageName: slot.packageName,
        renderer: slot.renderer,
        componentName: slot.componentName,
      })),
      commands: [...this.commands.values()].map((command) => ({
        id: command.id,
        title: command.title,
        pluginId: command.pluginId,
        packageName: command.packageName,
      })),
      printTemplates: [...this.templates.values()].map((template) => ({
        id: template.id,
        pluginId: template.pluginId,
        packageName: template.packageName,
      })),
    };
  }

  /** 渲染进程通过 IPC 触发命令。命令不存在或抛错都返回结构化失败，不炸 IPC。 */
  async runCommand(id: string): Promise<RunCommandResult> {
    const command = this.commands.get(id);
    if (!command) return { ok: false, error: `未注册的命令：${id}` };
    try {
      await command.handler();
      return { ok: true, error: null };
    } catch (error) {
      this.logger.error(`命令 ${id} 执行失败`, error);
      return { ok: false, error: errorMessage(error) };
    }
  }

  async dispose(): Promise<void> {
    await this.unloadAll();
  }

  private readEnabledPluginNames(): string[] {
    let text: string;
    try {
      text = readFileSync(this.manifestPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.warn(`没有 ${PLUGINS_MANIFEST_FILE}，按无插件启动`);
      } else {
        this.logger.error('读取插件清单失败，按无插件启动', error);
      }
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed) || !Array.isArray(parsed.enabled)) {
        throw new Error('enabled 必须是包名数组');
      }
      const enabled: string[] = [];
      for (const entry of parsed.enabled) {
        if (typeof entry !== 'string' || entry.trim() === '') {
          this.logger.warn('插件清单里有非字符串包名，已忽略', entry);
          continue;
        }
        if (!enabled.includes(entry)) enabled.push(entry);
      }
      return enabled;
    } catch (error) {
      this.logger.error('插件清单不是合法 JSON，按无插件启动', error);
      return [];
    }
  }

  private resolvePackageJson(packageName: string): string {
    try {
      return this.pluginRequire.resolve(`${packageName}/package.json`);
    } catch {
      const fallback = join(this.pluginsDir, 'node_modules', packageName, 'package.json');
      if (existsSync(fallback)) return fallback;
      throw new Error(`插件 ${packageName} 没有安装（在 plugins/node_modules 下找不到）`);
    }
  }

  private async loadOne(packageName: string): Promise<void> {
    const status: PluginStatus = {
      id: packageName,
      packageName,
      displayName: packageName,
      version: '0.0.0',
      apiVersion: '',
      capabilities: [],
      state: 'failed',
      error: null,
      activatedAt: null,
      durationMs: null,
    };
    this.statuses.set(packageName, status);
    let activeCollected: Collected | null = null;

    try {
      const packageJsonPath = this.resolvePackageJson(packageName);
      // 重载时必须重新读 package.json，否则 manifest 的修改永远不生效。
      delete this.pluginRequire.cache[packageJsonPath];
      const packageJson: unknown = this.pluginRequire(packageJsonPath);
      if (!isRecord(packageJson)) throw new Error('package.json 不是对象');

      const manifest = parsePluginManifest(packageJson.gofor, packageName);
      for (const other of this.loaded.values()) {
        if (other.manifest.id === manifest.id) {
          throw new Error(`插件 id 冲突：${manifest.id}（${other.packageName} 与 ${packageName}）`);
        }
      }
      status.id = manifest.id;
      status.displayName = manifest.displayName;
      status.version = manifest.version;
      status.apiVersion = manifest.apiVersion;
      status.capabilities = [...manifest.capabilities];

      if (manifest.apiVersion !== SUPPORTED_API_VERSION) {
        status.state = 'incompatible';
        status.error = `apiVersion ${manifest.apiVersion} 与核心 ${SUPPORTED_API_VERSION} 不匹配`;
        this.logger.error(`插件 ${packageName} 不兼容：${status.error}`);
        return;
      }

      const packageDir = dirname(packageJsonPath);
      const mainPath = resolveInsidePackage(packageDir, manifest.main);
      delete this.pluginRequire.cache[mainPath];
      const rawModule: unknown = this.pluginRequire(mainPath);
      const pluginModule = normalizePluginModule(rawModule, packageName);

      const collected = createCollected();
      activeCollected = collected;
      const api = this.createApi(packageName, manifest, collected);
      const startedAt = this.now();
      try {
        await withTimeout(
          Promise.resolve().then(() => pluginModule.activate(api)),
          this.timeoutMs,
          `activate 超过 ${this.timeoutMs}ms`,
        );
      } catch (error) {
        // 超时后 activate 可能还在跑；关掉暂存区，迟到的注册不会生效。
        collected.active = false;
        status.state = 'failed';
        status.error = errorMessage(error);
        this.logger.error(`插件 ${packageName} 激活失败`, error);
        return;
      }

      this.mergeRegistrations(collected);
      status.state = 'active';
      status.error = null;
      status.activatedAt = this.now();
      status.durationMs = this.now() - startedAt;
      this.loaded.set(packageName, {
        packageName,
        manifest,
        module: pluginModule,
        api,
        collected,
      });
      this.logger.info(`插件 ${manifest.id}（${packageName}）已激活，${status.durationMs}ms`);
    } catch (error) {
      if (activeCollected) activeCollected.active = false;
      status.state = 'failed';
      status.error = errorMessage(error);
      this.logger.error(`插件 ${packageName} 加载失败`, error);
    } finally {
      this.bumpVersion();
    }
  }

  private createApi(
    packageName: string,
    manifest: PluginManifest,
    collected: Collected,
  ): GoForPluginAPI {
    // 超时/卸载后 activate 可能还在跑；迟到的注册直接忽略并记日志，
    // 不能让一个已失败的插件把主进程的定时器回调变成未捕获异常。
    const skipIfInactive = (what: string): boolean => {
      if (collected.active) return false;
      this.logger.warn(`插件 ${manifest.id} 已停用，忽略迟到的${what}注册`);
      return true;
    };
    const assertCapability = (capability: PluginCapability, label: string): void => {
      if (!manifest.capabilities.includes(capability)) {
        throw new Error(`插件 ${manifest.id} 未声明 "${capability}" 能力，不能注册${label}`);
      }
    };

    return {
      registerCommand: (command) => {
        if (skipIfInactive('命令')) return;
        if (
          typeof command.id !== 'string' ||
          command.id.trim() === '' ||
          typeof command.title !== 'string' ||
          typeof command.handler !== 'function'
        ) {
          throw new Error('registerCommand 参数非法：需要 { id, title, handler }');
        }
        assertCapability('command', '命令');
        if (this.commands.has(command.id) || collected.commands.some((c) => c.id === command.id)) {
          throw new Error(`命令 id 冲突：${command.id}`);
        }
        collected.commands.push({
          id: command.id,
          title: command.title,
          handler: command.handler,
          pluginId: manifest.id,
          packageName,
        });
      },

      registerViewSlot: (slotId, component) => {
        if (skipIfInactive('视图插槽')) return;
        if (typeof slotId !== 'string' || slotId.trim() === '') {
          throw new Error('registerViewSlot: slotId 必须是非空字符串');
        }
        assertCapability('view-slot', '视图插槽');
        collected.slots.push({
          slotId,
          pluginId: manifest.id,
          packageName,
          renderer: manifest.renderer ?? null,
          componentName: componentExportName(component),
          component,
        });
      },

      registerPrintTemplate: (template) => {
        if (skipIfInactive('打印模板')) return;
        if (
          typeof template.id !== 'string' ||
          template.id.trim() === '' ||
          typeof template.render !== 'function'
        ) {
          throw new Error('registerPrintTemplate 参数非法：需要 { id, render }');
        }
        assertCapability('print-template', '打印模板');
        if (
          this.templates.has(template.id) ||
          collected.templates.some((t) => t.id === template.id)
        ) {
          throw new Error(`打印模板 id 冲突：${template.id}`);
        }
        collected.templates.push({
          id: template.id,
          render: template.render,
          pluginId: manifest.id,
          packageName,
        });
      },

      getTasks: async () => {
        if (!collected.active) throw new Error('插件已停用');
        return await this.taskStore.getTasks();
      },

      updateTask: async (id: string, patch: Partial<Task>) => {
        if (!collected.active) throw new Error('插件已停用');
        if (typeof id !== 'string' || id.trim() === '') {
          throw new Error('updateTask: id 必须是非空字符串');
        }
        await this.taskStore.updateTask(id, patch);
      },
    };
  }

  private mergeRegistrations(collected: Collected): void {
    // 合并前再查一次冲突，保证不会出现"一半进表、一半失败"。
    for (const command of collected.commands) {
      if (this.commands.has(command.id)) throw new Error(`命令 id 冲突：${command.id}`);
    }
    for (const template of collected.templates) {
      if (this.templates.has(template.id)) throw new Error(`打印模板 id 冲突：${template.id}`);
    }
    for (const command of collected.commands) this.commands.set(command.id, command);
    for (const template of collected.templates) this.templates.set(template.id, template);
    for (const slot of collected.slots) this.slots.push(slot);
  }

  private bumpVersion(): void {
    this.version += 1;
  }
}
