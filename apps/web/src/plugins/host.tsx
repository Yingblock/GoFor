import { newId as createId } from '@gofor/core';
import type { ScanResult } from '@gofor/core/domain';
import {
  type DataContractEntry,
  describeDataDependencies,
  findDataProviderConflicts,
  findShortcutConflicts,
  formatScreenHash,
  isNamespacedId,
  resolvePluginOrder,
  type ShortcutBinding,
  validatePluginManifest,
} from '@gofor/core/plugin';
import { scanResultOwner } from '@gofor/core/scan';
import {
  type AiProvider,
  type CommandContribution,
  type CommandRunContext,
  type ConnectorContribution,
  type ContentModuleContribution,
  type ConverterContribution,
  type CssContribution,
  type DataClient,
  type DataContract,
  type HomeBlockContribution,
  type OcrProvider,
  PLUGIN_API_VERSION,
  type PluginContext,
  type PluginManifest,
  type PluginModule,
  type PluginStorage,
  type PluginStoreLike,
  type ScanHandlerContribution,
  type ScreenContribution,
  type SlotContribution,
  type ThemeContribution,
  unknownPermissions,
} from '@gofor/plugin-api';
import { BUILTIN_PLUGINS, builtinManifestJson, isBuiltinEnabledByDefault } from '@gofor/plugins';
import {
  createBuiltinDataProviders,
  db,
  ensureBuiltinPlugins,
  listPluginRecords,
  type PluginRecord,
  setPluginEnabled as storeSetPluginEnabled,
} from '@gofor/store';
import { liveQuery } from 'dexie';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { appClock } from '../clock.ts';
import { buildNav, CORE_NAV, flattenNav, type NavGroup } from '../nav.ts';
import { PaperHomeBlock } from '../screens/PaperHomeBlock.tsx';
import { externalHostOrigin, loadExternalPlugins } from './external.ts';
import { createPluginStorage } from './pluginStorage.ts';
import { createPluginStore } from './pluginStore.ts';
import { notConfiguredAi, notConfiguredOcr } from './providers.ts';
import type {
  DataProviderSummary,
  HostCommand,
  HostSnapshot,
  PluginHostApi,
  PluginInfo,
  PrintBlockOwnerInfo,
  RegisteredConnector,
  RegisteredContent,
  RegisteredConverter,
  RegisteredCss,
  RegisteredHomeBlock,
  RegisteredSlot,
  RegisteredTheme,
  ScreenEntry,
} from './types.ts';
import { sanitizeThemeTokens, scopePluginCss } from './uiExtensions.ts';

/** 每个插件在 activate 期间登记的东西；activate 抛错就整份丢弃。 */
interface Collected {
  screens: ScreenContribution[];
  homeBlocks: HomeBlockContribution[];
  commands: CommandContribution[];
  slots: SlotContribution[];
  themes: ThemeContribution[];
  css: CssContribution[];
  content: ContentModuleContribution[];
  converters: ConverterContribution[];
  connectors: ConnectorContribution[];
  data: DataContract[];
  scanHandlers: ScanHandlerContribution[];
  ocr: OcrProvider[];
  ai: AiProvider[];
}

function emptyCollected(): Collected {
  return {
    screens: [],
    homeBlocks: [],
    commands: [],
    slots: [],
    themes: [],
    css: [],
    content: [],
    converters: [],
    connectors: [],
    data: [],
    scanHandlers: [],
    ocr: [],
    ai: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptySnapshot(): HostSnapshot {
  return {
    ready: false,
    bootstrapError: null,
    version: 0,
    plugins: [],
    screens: [],
    homeBlocks: [],
    nav: buildNav([]),
    commands: [],
    shortcuts: [],
    conflicts: [],
    slots: [],
    themes: [],
    css: [],
    content: [],
    converters: [],
    connectors: [],
    activeTheme: null,
    dataProviders: [],
    printBlockOwners: [],
    scanPayloadOwners: {},
    ocr: notConfiguredOcr,
    ai: notConfiguredAi,
  };
}

/** 把一个数据契约包装成宿主内部的 provider 记录。 */
function toEntry(
  contract: DataContract,
  providerId: string,
  source: 'core' | 'plugin',
): DataContractEntry {
  return {
    id: contract.id,
    version: contract.version,
    providerId,
    source,
    query: (input: unknown) => contract.query(input),
    revision: () => contract.revision(),
  };
}

function createCoreDataEntries(ownerIds: ReadonlySet<string>): DataContractEntry[] {
  return createBuiltinDataProviders(db)
    .filter((provider) => provider.owner === undefined || ownerIds.has(provider.owner))
    .map((provider) =>
      toEntry(
        {
          id: provider.id,
          version: provider.version,
          summary: provider.summary,
          query: (value) => provider.query(value),
          revision: () => provider.revision(),
        },
        'core',
        'core',
      ),
    );
}

/**
 * 取一个数据 provider（不含版本校验）。
 *
 * 版本校验发生在两处：安装页按 manifest 声明检查；`resolveDataContract` 提供给
 * 需要精确版本的地方。这里给 UI/命令一个"按 id 取最新可用"的简单语义。
 */
function pickProvider(entries: readonly DataContractEntry[], id: string): DataContractEntry | null {
  const matching = entries.filter((entry) => entry.id === id);
  return matching.find((entry) => entry.source === 'core') ?? matching[0] ?? null;
}

/**
 * 数据客户端：core 与插件走同一条路（P3-3.9）。
 *
 * `watch` 用 Dexie 的 liveQuery：provider 的 query 里读的表会被自动追踪，
 * 插件不需要自己轮询，也不会拿到过期快照。
 */
function createDataClient(entriesRef: { current: DataContractEntry[] }): DataClient {
  return {
    available: (id) => pickProvider(entriesRef.current, id) !== null,
    async query<T>(id: string, input?: unknown): Promise<T | null> {
      const provider = pickProvider(entriesRef.current, id);
      if (!provider) return null;
      try {
        return (await provider.query(input)) as T;
      } catch (error) {
        // provider 抛错不能连带页面崩掉；返回 null 让调用方显示「不可用」。
        console.warn(`[plugin] 数据契约 ${id} 查询失败`, error);
        return null;
      }
    },
    async revision(id: string): Promise<number | null> {
      const provider = pickProvider(entriesRef.current, id);
      if (!provider) return null;
      try {
        return await provider.revision();
      } catch {
        return null;
      }
    },
    watch<T>(id: string, input: unknown, onChange: (value: T | null) => void): () => void {
      const observable = liveQuery(async () => {
        const provider = pickProvider(entriesRef.current, id);
        if (!provider) return null;
        try {
          return (await provider.query(input)) as T;
        } catch (error) {
          console.warn(`[plugin] 数据契约 ${id} 订阅失败`, error);
          return null;
        }
      });
      const subscription = observable.subscribe({
        next: (value: T | null) => onChange(value ?? null),
        error: (error: unknown) => {
          console.warn(`[plugin] 数据契约 ${id} 订阅出错`, error);
          onChange(null);
        },
      });
      return () => subscription.unsubscribe();
    },
    status(id) {
      const provider = pickProvider(entriesRef.current, id);
      return provider
        ? { status: 'available', providerId: provider.providerId, version: provider.version }
        : { status: 'missing', reason: 'not-installed' };
    },
  };
}

const FORBIDDEN_STORAGE: PluginStorage = {
  async get() {
    throw new Error('插件没有声明 storage 权限');
  },
  async put() {
    throw new Error('插件没有声明 storage 权限');
  },
  async list() {
    throw new Error('插件没有声明 storage 权限');
  },
  async delete() {
    throw new Error('插件没有声明 storage 权限');
  },
  async clear() {
    throw new Error('插件没有声明 storage 权限');
  },
};

function restrictedData(data: DataClient): DataClient {
  return {
    ...data,
    available: () => false,
    query: async () => null,
    revision: async () => null,
    watch: () => () => {},
    status: () => ({ status: 'missing', reason: 'not-installed' }),
  };
}

function assertContractId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(id)) {
    throw new Error(`数据契约 id 必须是点分小写命名（例如 wordbook.entries）：${id}`);
  }
}

/** 建宿主上下文；权限不足的注册直接抛错，整个插件算启用失败。 */
function createPluginContext(input: {
  pluginId: string;
  manifest: PluginManifest;
  collector: Collected;
  data: DataClient;
  storage: PluginStorage;
  store: PluginStoreLike;
}): PluginContext {
  const { pluginId, manifest, collector, data, storage, store } = input;

  const requirePermission = (permission: string): void => {
    if (!(manifest.permissions as readonly string[]).includes(permission)) {
      throw new Error(`插件 ${pluginId} 没有声明 ${permission} 权限`);
    }
  };
  const requireNamespaced = (id: string): void => {
    if (!isNamespacedId(pluginId, id)) {
      throw new Error(`注册项 id 必须以 ${pluginId}/ 开头：${id}`);
    }
  };

  return {
    pluginId,
    manifest,
    permissions: manifest.permissions,
    data,
    storage,
    store,
    now: () => appClock.now(),
    newId: createId,
    registerScreen(contribution) {
      requirePermission('ui.screen');
      requireNamespaced(contribution.id);
      collector.screens.push(contribution);
    },
    registerHomeBlock(contribution) {
      requirePermission('ui.home');
      requireNamespaced(contribution.id);
      if (contribution.title.trim() === '') throw new Error('首页块 title 不能为空');
      collector.homeBlocks.push(contribution);
    },
    registerCommand(contribution) {
      requirePermission('command');
      requireNamespaced(contribution.id);
      collector.commands.push(contribution);
    },
    registerSlot(contribution) {
      requirePermission('ui.slot');
      requireNamespaced(contribution.id);
      collector.slots.push(contribution);
    },
    registerTheme(contribution) {
      requirePermission('ui.theme');
      requireNamespaced(contribution.id);
      collector.themes.push(contribution);
    },
    registerCss(contribution) {
      requirePermission('ui.css');
      requireNamespaced(contribution.id);
      collector.css.push(contribution);
    },
    registerContentModule(contribution) {
      requirePermission('data.provide');
      requireNamespaced(contribution.id);
      collector.content.push(contribution);
    },
    registerConverter(contribution) {
      requirePermission('converter');
      requireNamespaced(contribution.id);
      collector.converters.push(contribution);
    },
    registerConnector(contribution) {
      requirePermission('connector');
      requireNamespaced(contribution.id);
      collector.connectors.push(contribution);
    },
    registerScanHandler(contribution) {
      requirePermission('scan.handle');
      requireNamespaced(contribution.id);
      collector.scanHandlers.push(contribution);
    },
    registerData(contract) {
      requirePermission('data.provide');
      assertContractId(contract.id);
      collector.data.push(contract);
    },
    registerOcrProvider(provider) {
      requirePermission('ocr');
      collector.ocr.push(provider);
    },
    registerAiProvider(provider) {
      requirePermission('ai');
      collector.ai.push(provider);
    },
    log(message, detail) {
      console.info(`[plugin:${pluginId}] ${message}`, detail ?? '');
    },
  };
}

function parseStoredManifest(record: PluginRecord): PluginManifest | null {
  try {
    const parsed = JSON.parse(record.manifestJson) as PluginManifest;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

interface BuildResult {
  snapshot: HostSnapshot;
  activeModules: PluginModule[];
  scanHandlers: Map<string, ScanHandlerContribution>;
  pluginNames: Map<string, string>;
  enabledPluginIds: Set<string>;
}

async function buildPluginHost(input: {
  previousActive: readonly PluginModule[];
  coreCommands: readonly HostCommand[];
  entriesRef: { current: DataContractEntry[] };
  data: DataClient;
  dataFor: (pluginId: string) => DataClient;
  storageFor: (pluginId: string) => PluginStorage;
}): Promise<BuildResult> {
  const { previousActive, coreCommands, entriesRef, data, dataFor, storageFor } = input;
  const now = appClock.now();

  await ensureBuiltinPlugins(
    db,
    BUILTIN_PLUGINS.map((plugin) => ({
      id: plugin.manifest.id,
      manifestJson: builtinManifestJson(plugin),
      enabledByDefault: isBuiltinEnabledByDefault(plugin.manifest.id),
    })),
    now,
  );

  const records = await listPluginRecords(db);
  const recordById = new Map(records.map((record) => [record.id, record]));

  // 1. 组装模块：插件是应用构建的一部分（npm 包），没有运行时源码加载。
  const modules = new Map<string, PluginModule>();
  for (const plugin of BUILTIN_PLUGINS) {
    // manifest 漂移要在启动时炸，而不是运行到一半。
    const validation = validatePluginManifest(plugin.manifest, PLUGIN_API_VERSION);
    if (!validation.ok) {
      throw new Error(
        `内置插件 ${plugin.manifest.id} 的 manifest 非法：${validation.errors.join('；')}`,
      );
    }
    modules.set(plugin.manifest.id, plugin);
  }

  // 2. 依赖解析：不满足的插件不激活，但要出现在安装页并说明原因。
  const descriptors = [...modules.entries()].map(([id, module]) => {
    const record = recordById.get(id);
    const manifest = module.manifest;
    return {
      id,
      version: manifest.version,
      enabled: record?.enabled ?? true,
      ...(manifest.dependencies === undefined ? {} : { dependencies: manifest.dependencies }),
      ...(manifest.optionalDependencies === undefined
        ? {}
        : { optionalDependencies: manifest.optionalDependencies }),
    };
  });
  const resolved = resolvePluginOrder(descriptors);

  // 3. 先停掉上一轮激活的插件（取消订阅/计时器是插件自己的责任）。
  for (const module of previousActive) {
    try {
      await module.deactivate?.();
    } catch (error) {
      console.warn('[plugin] deactivate 失败', error);
    }
  }

  // 4. 数据 provider：core 先登记，但归属某个插件的数据在插件禁用时一起移除。
  //    这样“作业清单插件禁用”后，tasks.all 是 missing，消费方不能再读到任务。
  const enabledPluginIds = new Set(
    records.filter((record) => record.enabled).map((record) => record.id),
  );
  const entries = createCoreDataEntries(enabledPluginIds);
  entriesRef.current = entries;

  const collected = new Map<string, Collected>();
  const activationErrors = new Map<string, string>();
  const activeModules: PluginModule[] = [];
  const conflicts: string[] = [];

  for (const id of resolved.order) {
    const module = modules.get(id);
    if (!module) continue;
    const collector = emptyCollected();
    const storage = manifestHas(module.manifest, 'storage') ? storageFor(id) : FORBIDDEN_STORAGE;
    try {
      const context = createPluginContext({
        pluginId: id,
        manifest: module.manifest,
        collector,
        data: manifestHas(module.manifest, 'data.read')
          ? data
          : {
              ...data,
              available: () => false,
              query: async () => null,
              revision: async () => null,
              watch: () => () => {},
              status: () => ({ status: 'missing', reason: 'not-installed' }),
            },
        storage,
        store: createPluginStore(id),
      });
      await module.activate(context);
      collected.set(id, collector);
      activeModules.push(module);
      for (const contract of collector.data) {
        entries.push(toEntry(contract, id, 'plugin'));
      }
    } catch (error) {
      activationErrors.set(id, errorMessage(error));
    }
  }

  // 5. 屏幕：内核页面 + 插件页面，同用一张表。
  // home / capture 不在侧栏分组里（首页与拍照入口），但同样是可路由页面。
  const screenEntries: ScreenEntry[] = [
    {
      id: 'home',
      title: '首页',
      group: '',
      ready: true,
      kind: 'core',
      layout: 'content',
      chrome: 'default',
      shell: 'default',
    },
  ];
  screenEntries.push(
    ...flattenNav(CORE_NAV).map(
      (item): ScreenEntry => ({
        id: item.id,
        title: item.title,
        group:
          CORE_NAV.find((group) => group.items.some((entry) => entry.id === item.id))?.code ??
          '离线·M1',
        ready: item.ready,
        ...(item.icon === undefined ? {} : { icon: item.icon }),
        kind: 'core',
        layout: 'content',
        chrome: 'default',
        shell: 'default',
      }),
    ),
  );

  const pluginScreens: ScreenEntry[] = [];
  for (const [pluginId, collector] of collected) {
    for (const screen of collector.screens) {
      if (screenEntries.some((entry) => entry.id === screen.id)) {
        conflicts.push(`页面 id ${screen.id} 重复，已忽略「${pluginId}」的注册`);
        continue;
      }
      const entry: ScreenEntry = {
        id: screen.id,
        title: screen.title,
        group: screen.group,
        ready: true,
        ...(screen.icon === undefined ? {} : { icon: screen.icon }),
        ...(screen.order === undefined ? {} : { order: screen.order }),
        kind: 'plugin',
        pluginId,
        layout: screen.layout,
        chrome: screen.chrome,
        shell: screen.shell ?? 'default',
        load: screen.load,
      };
      screenEntries.push(entry);
      pluginScreens.push(entry);
    }
  }

  const nav: NavGroup[] = buildNav(
    pluginScreens.map((screen) => ({
      id: screen.id,
      title: screen.title,
      group: screen.group,
      pluginId: screen.pluginId ?? '',
      ...(screen.icon === undefined ? {} : { icon: screen.icon }),
      ...(screen.order === undefined ? {} : { order: screen.order }),
    })),
  );

  // 6. 命令与快捷键：core 命令由 App 注册，插件命令在这里汇总。
  const pluginCommands: HostCommand[] = [];
  for (const [pluginId, collector] of collected) {
    for (const command of collector.commands) {
      if (pluginCommands.some((entry) => entry.id === command.id)) {
        conflicts.push(`命令 id ${command.id} 重复，已忽略「${pluginId}」的注册`);
        continue;
      }
      const runContext: CommandRunContext = {
        navigate: navigateToScreen,
        data: dataFor(pluginId),
        storage: storageFor(pluginId),
        now: () => appClock.now(),
        newId: createId,
      };
      pluginCommands.push({
        id: command.id,
        title: command.title,
        ...(command.hint === undefined ? {} : { hint: command.hint }),
        ...(command.shortcut === undefined ? {} : { shortcut: command.shortcut }),
        source: pluginId,
        run: () => command.run(runContext),
      });
    }
  }
  const commands: HostCommand[] = [...coreCommands, ...pluginCommands];
  const bindings: ShortcutBinding[] = commands
    .filter((command) => command.shortcut !== undefined)
    .map((command) => ({
      commandId: command.id,
      shortcut: command.shortcut ?? '',
      source: command.source,
    }));

  // 7. 插槽 / 主题 / CSS / 内容模块 / 转换器。
  const homeBlocks: RegisteredHomeBlock[] = [
    {
      id: 'core.paper',
      title: '纸面闭环',
      pluginId: 'core',
      order: 10,
      span: 2,
      load: async () => ({ default: PaperHomeBlock }),
    },
  ];
  const slots: RegisteredSlot[] = [];
  const themes: RegisteredTheme[] = [];
  const css: RegisteredCss[] = [];
  const content: RegisteredContent[] = [];
  const converters: RegisteredConverter[] = [];
  const connectors: RegisteredConnector[] = [];
  let activeTheme: RegisteredTheme | null = null;
  const ocrProviders: OcrProvider[] = [];
  const aiProviders: AiProvider[] = [];

  for (const [pluginId, collector] of collected) {
    for (const block of collector.homeBlocks) {
      if (homeBlocks.some((entry) => entry.id === block.id)) {
        conflicts.push(`首页块 id ${block.id} 重复，已忽略「${pluginId}」的注册`);
        continue;
      }
      homeBlocks.push({
        id: block.id,
        title: block.title,
        pluginId,
        order: block.order ?? 100,
        span: block.span ?? 1,
        load: block.load,
      });
    }
    for (const slot of collector.slots) {
      slots.push({
        id: slot.id,
        pluginId,
        slot: slot.slot,
        order: slot.order ?? 0,
        load: slot.load,
      });
    }
    for (const theme of collector.themes) {
      const registered: RegisteredTheme = { ...theme, pluginId };
      themes.push(registered);
      // 多个主题包同时启用时，按激活顺序取第一个；安装页会显示"当前生效"。
      activeTheme = activeTheme ?? registered;
    }
    for (const contribution of collector.css) {
      css.push({ ...contribution, pluginId });
    }
    for (const module of collector.content) {
      content.push({
        id: module.id,
        pluginId,
        kind: module.kind,
        name: module.name,
        ...(module.screenId === undefined ? {} : { screenId: module.screenId }),
        collections: module.collections,
        search: module.search,
      });
    }
    for (const converter of collector.converters) {
      converters.push({
        id: converter.id,
        pluginId,
        title: converter.title,
        from: converter.from,
        to: converter.to,
        ...(converter.worker === undefined ? {} : { worker: converter.worker }),
        needsDesktopBridge: converter.needsDesktopBridge === true,
      });
    }
    for (const connector of collector.connectors) {
      connectors.push({
        id: connector.id,
        pluginId,
        title: connector.title,
        protocol: connector.protocol,
        needsDesktopBridge: connector.needsDesktopBridge,
      });
    }
    ocrProviders.push(...collector.ocr);
    aiProviders.push(...collector.ai);
  }

  slots.sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId));

  // 8. 安装页信息。
  const plugins: PluginInfo[] = [];
  for (const [id, module] of modules) {
    const record = recordById.get(id);
    const manifest = module.manifest;
    const collector = collected.get(id);
    const blocked = resolved.blocked.includes(id);
    const problem = resolved.problems.find((entry) => entry.pluginId === id);
    plugins.push({
      id,
      name: manifest.name,
      version: manifest.version,
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
      ...(manifest.author === undefined ? {} : { author: manifest.author }),
      kind: record?.kind ?? 'installed',
      enabled: record?.enabled ?? true,
      permissions: [...manifest.permissions],
      unknownPermissions: unknownPermissions(manifest.permissions),
      activationError: activationErrors.get(id) ?? null,
      blockedReason: blocked ? (problem?.message ?? '依赖不满足') : null,
      consumes: describeDataDependencies(manifest.consumes?.data ?? [], entries),
      providesData: manifest.provides?.data ?? [],
      screens: collector?.screens.map((screen) => screen.id) ?? manifest.provides?.screens ?? [],
      commands:
        collector?.commands.map((command) => command.id) ?? manifest.provides?.commands ?? [],
      contentModules: collector?.content.map((entry) => entry.id) ?? [],
      themes: collector?.themes.map((entry) => entry.id) ?? manifest.provides?.themes ?? [],
      converters: collector?.converters.map((entry) => entry.id) ?? [],
      installedAt: record?.installedAt ?? 0,
    });
  }

  plugins.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'builtin' ? -1 : 1;
    if (a.kind === 'builtin') {
      const indexA = BUILTIN_PLUGINS.findIndex((plugin) => plugin.manifest.id === a.id);
      const indexB = BUILTIN_PLUGINS.findIndex((plugin) => plugin.manifest.id === b.id);
      return indexA - indexB;
    }
    return a.id.localeCompare(b.id);
  });

  const contractSummaries = new Map<string, string>(Object.entries(BUILTIN_CONTRACT_SUMMARIES));
  for (const module of modules.values()) {
    for (const declared of module.manifest.provides?.data ?? []) {
      if (declared.summary !== '') contractSummaries.set(declared.id, declared.summary);
    }
  }
  // 9. 扫描处理器：按插件 id 建表；同一插件的多个 handler 只保留第一个。
  const scanHandlers = new Map<string, ScanHandlerContribution>();
  for (const [pluginId, collector] of collected) {
    const handler = collector.scanHandlers[0];
    if (handler) scanHandlers.set(pluginId, handler);
  }

  // 10. 打印区块归属：从**所有**记录（含禁用）的 manifest 读取，禁用后仍知道
  //     这个 kind 属于谁，才能给出「缺失 XX 插件」而不是悄悄按 core 渲染。
  const printBlockOwners: PrintBlockOwnerInfo[] = [];
  const scanPayloadOwners: Record<string, string> = {};
  for (const pluginId of collected.keys()) {
    const module = modules.get(pluginId);
    for (const prefix of module?.manifest.provides?.scanPayloads ?? []) {
      if (Object.hasOwn(scanPayloadOwners, prefix)) {
        conflicts.push(`扫描前缀 ${prefix} 重复，已忽略「${pluginId}」`);
        continue;
      }
      scanPayloadOwners[prefix] = pluginId;
    }
  }
  const ownerByKind = new Map<string, string>();
  for (const record of records) {
    if (!modules.has(record.id)) continue;
    const manifest = parseStoredManifest(record);
    if (!manifest) continue;
    for (const kind of manifest.provides?.printBlocks ?? []) {
      const existing = ownerByKind.get(kind);
      if (existing !== undefined) {
        if (existing !== record.id) {
          conflicts.push(`打印区块 ${kind} 同时归属 ${existing} 与 ${record.id}，只使用前者`);
        }
        continue;
      }
      ownerByKind.set(kind, record.id);
      printBlockOwners.push({
        kind,
        pluginId: record.id,
        name: manifest.name,
        enabled: record.enabled,
      });
    }
  }

  const dataProviders: DataProviderSummary[] = entries.map((entry) => ({
    id: entry.id,
    version: entry.version,
    summary: contractSummaries.get(entry.id) ?? '插件提供的数据',
    providerId: entry.providerId,
    source: entry.source,
  }));

  const providerConflicts = findDataProviderConflicts(entries);
  conflicts.push(...providerConflicts);

  const pluginNames = new Map<string, string>();
  for (const [id, module] of modules) pluginNames.set(id, module.manifest.name);
  for (const record of records) {
    if (!pluginNames.has(record.id)) {
      const manifest = parseStoredManifest(record);
      pluginNames.set(record.id, manifest?.name ?? record.id);
    }
  }

  return {
    activeModules,
    scanHandlers,
    pluginNames,
    enabledPluginIds,
    snapshot: {
      ready: true,
      bootstrapError: null,
      version: 1,
      plugins,
      screens: screenEntries,
      nav,
      commands,
      shortcuts: findShortcutConflicts(bindings),
      conflicts,
      homeBlocks,
      slots,
      themes,
      css,
      content,
      converters,
      connectors,
      activeTheme,
      dataProviders,
      printBlockOwners,
      scanPayloadOwners,
      ocr: ocrProviders[0] ?? notConfiguredOcr,
      ai: aiProviders[0] ?? notConfiguredAi,
    },
  };
}

const BUILTIN_CONTRACT_SUMMARIES: Record<string, string> = {
  'sessions.range': '某一日期区间内的学习记录',
  'subjects.all': '全部科目',
  'habits.range': '打卡项定义 + 区间内的打卡记录',
  'mood.range': '区间内的三滑块',
  'diary.range': '区间内的情绪日记',
  'toolbox.recent': '最近的放松练习记录',
  'tasks.all': '全部作业',
  'checklists.all': '环境清单定义',
};

/** 命令/插槽里跳页面：直接改 hash，由路由 hook 统一接收。 */
function navigateToScreen(screenId: string): void {
  const hash = formatScreenHash(screenId);
  if (window.location.hash !== hash) window.location.hash = hash;
}

function manifestHas(manifest: PluginManifest, permission: string): boolean {
  return (manifest.permissions as readonly string[]).includes(permission);
}

/* --------------------------------------------------------------- Provider */

const PluginHostContext = createContext<PluginHostApi | null>(null);

export function PluginHostProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<HostSnapshot>(emptySnapshot);
  const entriesRef = useRef<DataContractEntry[]>([]);
  const coreCommandsRef = useRef<HostCommand[]>([]);
  const activeModulesRef = useRef<PluginModule[]>([]);
  const scanHandlersRef = useRef<Map<string, ScanHandlerContribution>>(new Map());
  const pluginNamesRef = useRef<Map<string, string>>(new Map());
  const externalPluginsRef = useRef<Map<string, PluginInfo>>(new Map());
  const rebuildingRef = useRef(false);
  const versionRef = useRef(0);
  const data = useMemo(() => createDataClient(entriesRef), []);
  const dataFor = useCallback(
    (pluginId: string): DataClient => {
      const info = snapshot.plugins.find((plugin) => plugin.id === pluginId);
      if (pluginId === 'gofor.pomodoro') console.log('DATA-FOR', info?.permissions);
      return info?.permissions.includes('data.read') ? data : restrictedData(data);
    },
    [data, snapshot.plugins],
  );

  const storageFor = useCallback(
    (pluginId: string) => createPluginStorage(db, pluginId, () => appClock.now()),
    [],
  );
  const storeFor = useCallback((pluginId: string) => createPluginStore(pluginId), []);

  const rebuild = useCallback(async () => {
    if (rebuildingRef.current) return;
    rebuildingRef.current = true;
    try {
      const result = await buildPluginHost({
        previousActive: activeModulesRef.current,
        coreCommands: coreCommandsRef.current,
        entriesRef,
        data,
        dataFor,
        storageFor,
      });
      activeModulesRef.current = result.activeModules;
      scanHandlersRef.current = result.scanHandlers;
      pluginNamesRef.current = result.pluginNames;

      // 外部插件（plugin-host）可选：宿主不在线时 PWA 继续只跑内置插件。
      const external = await loadExternalPlugins({
        data,
        applyScan,
        navigate,
        back,
        now,
        newId: createId,
        storageFor,
        storeFor,
      }).catch((error: unknown) => {
        console.warn('[external] 加载失败', error);
        return null;
      });
      let snapshot = result.snapshot;
      if (external) {
        for (const [owner, handler] of external.scanHandlers) {
          scanHandlersRef.current.set(owner, handler);
        }
        pluginNamesRef.current = new Map([
          ...pluginNamesRef.current,
          ...external.plugins.map((plugin) => [plugin.id, plugin.name] as const),
        ]);
        const activeExternalPluginIds = external.plugins
          .filter((plugin) => plugin.enabled)
          .map((plugin) => plugin.id);
        const coreEntries = createCoreDataEntries(
          new Set([...result.enabledPluginIds, ...activeExternalPluginIds]),
        );
        entriesRef.current = [...coreEntries, ...external.dataContracts];
        const coreProviders = coreEntries.map((entry) => ({
          id: entry.id,
          version: entry.version,
          summary: BUILTIN_CONTRACT_SUMMARIES[entry.id] ?? 'core 提供的数据',
          providerId: entry.providerId,
          source: entry.source,
        }));
        for (const plugin of external.plugins) externalPluginsRef.current.set(plugin.id, plugin);
        const activeExternalIds = new Set(external.plugins.map((plugin) => plugin.id));
        const disabledExternal = [...externalPluginsRef.current.values()]
          .filter((plugin) => !activeExternalIds.has(plugin.id))
          .map((plugin) => ({
            ...plugin,
            enabled: false,
            screens: [],
            commands: [],
            themes: [],
            contentModules: [],
            converters: [],
            providesData: [],
          }));
        const disabledPrintOwners = disabledExternal.flatMap((plugin) =>
          (plugin.printBlocks ?? []).map((kind) => ({
            kind,
            pluginId: plugin.id,
            name: plugin.name,
            enabled: false,
          })),
        );
        entriesRef.current = [...entriesRef.current, ...external.dataContracts];
        const screens = [...result.snapshot.screens, ...external.screens];
        snapshot = {
          ...result.snapshot,
          plugins: [...result.snapshot.plugins, ...external.plugins, ...disabledExternal],
          screens,
          nav: buildNav(
            screens
              .filter((screen) => screen.kind === 'plugin')
              .map((screen) => ({
                id: screen.id,
                title: screen.title,
                group: screen.group,
                pluginId: screen.pluginId ?? '',
                ...(screen.icon === undefined ? {} : { icon: screen.icon }),
                ...(screen.order === undefined ? {} : { order: screen.order }),
              })),
          ),
          homeBlocks: [...result.snapshot.homeBlocks, ...external.homeBlocks],
          commands: [...result.snapshot.commands, ...external.commands],
          slots: [...result.snapshot.slots, ...external.slots],
          themes: [...result.snapshot.themes, ...external.themes],
          css: [...result.snapshot.css, ...external.css],
          content: [...result.snapshot.content, ...external.content],
          converters: [...result.snapshot.converters, ...external.converters],
          connectors: [...result.snapshot.connectors, ...external.connectors],
          dataProviders: [...coreProviders, ...external.dataProviders],
          printBlockOwners: [
            ...result.snapshot.printBlockOwners,
            ...external.printBlockOwners,
            ...disabledPrintOwners,
          ],
          scanPayloadOwners: {
            ...result.snapshot.scanPayloadOwners,
            ...external.scanPayloadOwners,
          },
          conflicts: [...result.snapshot.conflicts, ...external.conflicts],
          activeTheme: result.snapshot.activeTheme ?? external.themes[0] ?? null,
          ocr: external.ocr[0] ?? result.snapshot.ocr,
          ai: external.ai[0] ?? result.snapshot.ai,
        };
      }
      versionRef.current += 1;
      setSnapshot({ ...snapshot, version: versionRef.current });
    } catch (error) {
      setSnapshot((previous) => ({
        ...previous,
        ready: true,
        bootstrapError: errorMessage(error),
      }));
    } finally {
      rebuildingRef.current = false;
    }
    // 故意不把 snapshot 放进依赖，否则每次重建都会自触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, storageFor]);

  useEffect(() => {
    void rebuild();
  }, [rebuild]);

  const setExternalPluginEnabled = useCallback(
    async (id: string, enabled: boolean, packageName?: string) => {
      const response = await fetch(`${externalHostOrigin()}/api/plugins/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled, packageName }),
      });
      if (!response.ok) throw new Error(`外部插件 ${id} 切换失败`);
      await rebuild();
    },
    [rebuild],
  );

  const navigate = useCallback((screenId: string) => {
    navigateToScreen(screenId);
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigateToScreen('home');
  }, []);

  const now = useCallback(() => appClock.now(), []);

  const registerCoreCommands = useCallback((next: HostCommand[]) => {
    coreCommandsRef.current = next;
    setSnapshot((previous) => {
      if (!previous.ready) return previous;
      const pluginCommands = previous.commands.filter((command) => command.source !== 'core');
      const commands = [...next, ...pluginCommands];
      const bindings: ShortcutBinding[] = commands
        .filter((command) => command.shortcut !== undefined)
        .map((command) => ({
          commandId: command.id,
          shortcut: command.shortcut ?? '',
          source: command.source,
        }));
      return { ...previous, commands, shortcuts: findShortcutConflicts(bindings) };
    });
  }, []);

  const setPluginEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await storeSetPluginEnabled(db, id, enabled, appClock.now());
      await rebuild();
    },
    [rebuild],
  );

  const reloadPlugins = useCallback(async () => {
    await rebuild();
  }, [rebuild]);

  // 作用域 CSS：卸载即移除；每次重建整体替换。
  useEffect(() => {
    const nodes: HTMLStyleElement[] = [];
    for (const contribution of snapshot.css) {
      const scoped = scopePluginCss(contribution.pluginId, contribution.css);
      if (scoped === null) continue;
      const style = document.createElement('style');
      style.dataset.pluginCss = contribution.pluginId;
      style.textContent = scoped;
      document.head.appendChild(style);
      nodes.push(style);
    }
    return () => {
      for (const node of nodes) node.remove();
    };
  }, [snapshot.css]);

  const applyScan = useCallback(
    async (results: readonly ScanResult[], date: string) => {
      const handlers = scanHandlersRef.current;
      const names = pluginNamesRef.current;
      const byOwner = new Map<string, ScanResult[]>();
      let skipped = 0;

      for (const result of results) {
        if (!result.selected) continue;
        const owner = scanResultOwner(result, snapshot.scanPayloadOwners);
        if (owner === null) {
          skipped += 1;
          continue;
        }
        const list = byOwner.get(owner) ?? [];
        list.push(result);
        byOwner.set(owner, list);
      }

      const parts: Array<{ pluginId: string; name: string; handled: number }> = [];
      const missing: Array<{ pluginId: string; name: string; count: number }> = [];
      const errors: string[] = [];
      let handled = 0;

      for (const [owner, list] of byOwner) {
        const handler = handlers.get(owner);
        const name = names.get(owner) ?? owner;
        if (!handler) {
          missing.push({ pluginId: owner, name, count: list.length });
          continue;
        }
        try {
          const outcome = await handler.handle(list, { date, now: () => appClock.now() });
          handled += outcome.handled;
          skipped += outcome.skipped;
          if (outcome.handled > 0) parts.push({ pluginId: owner, name, handled: outcome.handled });
        } catch (error) {
          errors.push(`${name}：${errorMessage(error)}`);
        }
      }

      return { handled, skipped, parts, missing, errors };
    },
    [snapshot.scanPayloadOwners],
  );

  const api = useMemo<PluginHostApi>(() => {
    // 主题 token 在展示前再过滤一次：即使插件 manifest 里写了怪值也到不了纸面。
    const safeTheme =
      snapshot.activeTheme === null
        ? null
        : { ...snapshot.activeTheme, tokens: sanitizeThemeTokens(snapshot.activeTheme.tokens) };
    return {
      ...snapshot,
      activeTheme: safeTheme,
      data,
      dataFor,
      applyScan,
      navigate,
      back,
      now,
      newId: createId,
      storageFor,
      storeFor,
      registerCoreCommands,
      setPluginEnabled,
      setExternalPluginEnabled,
      reloadPlugins,
    };
  }, [
    applyScan,
    back,
    data,
    navigate,
    now,
    registerCoreCommands,
    reloadPlugins,
    setPluginEnabled,
    snapshot,
    storageFor,
  ]);

  return <PluginHostContext.Provider value={api}>{children}</PluginHostContext.Provider>;
}

export function usePluginHost(): PluginHostApi {
  const host = useContext(PluginHostContext);
  if (!host) throw new Error('usePluginHost 必须在 PluginHostProvider 里使用');
  return host;
}

/** 主题 token（App 挂在屏幕层容器上；打印层在它之外，所以纸上不受影响）。 */
export function useActiveTheme() {
  const host = usePluginHost();
  return host.activeTheme;
}

export type { DataProviderSummary, HostSnapshot, PluginInfo, ScreenEntry };
