import type {
  PluginDataRegistration,
  PluginScanHandlerRegistration,
  PluginScreenRegistration,
  PluginStatus,
  PluginThemeRegistration,
} from '@gofor/contracts';
import { newId } from '@gofor/core';
import { type DataContractEntry, describeDataDependencies } from '@gofor/core/plugin';
import type {
  AiProvider,
  CommandRunContext,
  OcrProvider,
  PluginComponent,
  PluginContext,
  PluginModule,
  PluginScreenHost,
  PluginScreenProps,
  PluginSlotProps,
  ScanHandlerContribution,
} from '@gofor/plugin-api';
import { unknownPermissions } from '@gofor/plugin-api';
import { appClock } from '../clock.ts';
import type {
  DataProviderSummary,
  HostCommand,
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

/**
 * 外部插件通过 HTTP 从本地 plugin-host 取快照与 renderer。
 *
 * 阶段二：页面/主题/插槽/命令/数据/扫描 handler 都由 renderer 导出；
 * 主进程只提供声明与命令执行。宿主不在线时返回 null，PWA 继续只跑内置插件。
 */
const HOST_PORT = 47822;
const ENABLED_KEY = 'gofor.externalPlugins';

interface ExternalScreen extends PluginScreenRegistration {
  pluginId: string;
  packageName: string;
  renderer: string | null;
}
interface ExternalTheme extends PluginThemeRegistration {
  pluginId: string;
  packageName: string;
}
interface ExternalData extends PluginDataRegistration {
  pluginId: string;
  packageName: string;
}
interface ExternalScanHandler extends PluginScanHandlerRegistration {
  pluginId: string;
  packageName: string;
}
interface ExternalSlot {
  slotId: string;
  pluginId: string;
  packageName: string;
  renderer: string | null;
  componentName: string;
}
interface ExternalCommand {
  id: string;
  title: string;
  pluginId: string;
  packageName: string;
}
interface ExternalSnapshot {
  version: number;
  plugins: PluginStatus[];
  screens: ExternalScreen[];
  themes: ExternalTheme[];
  data: ExternalData[];
  scanHandlers: ExternalScanHandler[];
  slots: ExternalSlot[];
  commands: ExternalCommand[];
}

export interface ExternalActivationHost {
  data: PluginScreenHost['data'];
  applyScan: PluginScreenHost['applyScan'];
  navigate: PluginScreenHost['navigate'];
  back: PluginScreenHost['back'];
  now: () => number;
  newId: () => string;
  storageFor: (pluginId: string) => PluginScreenHost['storage'];
  storeFor: (pluginId: string) => PluginScreenHost['store'];
}

export interface ExternalAdditions {
  screens: ScreenEntry[];
  homeBlocks: RegisteredHomeBlock[];
  themes: RegisteredTheme[];
  slots: RegisteredSlot[];
  commands: HostCommand[];
  css: RegisteredCss[];
  content: RegisteredContent[];
  converters: RegisteredConverter[];
  connectors: RegisteredConnector[];
  ocr: OcrProvider[];
  ai: AiProvider[];
  printBlockOwners: PrintBlockOwnerInfo[];
  scanPayloadOwners: Record<string, string>;
  plugins: PluginInfo[];
  dataContracts: DataContractEntry[];
  dataProviders: DataProviderSummary[];
  scanHandlers: Map<string, ScanHandlerContribution>;
  conflicts: string[];
}

function permissionCheck(manifest: PluginModule['manifest'], permission: string): void {
  if (!(manifest.permissions as readonly string[]).includes(permission)) {
    throw new Error(`插件 ${manifest.id} 没有声明 ${permission} 权限`);
  }
}

/**
 * 用完整构建期 PluginContext 激活外部 renderer 里的 PluginModule。
 *
 * 这是“把现有构建期插件原样做成外部插件”的桥：插件仍用 PluginContext
 * 注册页面/首页块/数据/扫描 handler，宿主只是在 PWA 侧提供同一套上下文。
 */
function createExternalContext(
  plugin: PluginModule,
  host: ExternalActivationHost,
  additions: ExternalAdditions,
): PluginContext {
  const pluginId = plugin.manifest.id;
  const storage = host.storageFor(pluginId);
  const store = host.storeFor(pluginId);
  const requirePermission = (permission: string): void =>
    permissionCheck(plugin.manifest, permission);
  const requireNamespaced = (id: string): void => {
    if (!id.startsWith(`${pluginId}/`)) {
      throw new Error(`注册项 id 必须以 ${pluginId}/ 开头：${id}`);
    }
  };

  return {
    pluginId,
    manifest: plugin.manifest,
    permissions: plugin.manifest.permissions,
    data: host.data,
    storage,
    store,
    now: () => appClock.now(),
    newId,
    registerScreen(contribution) {
      requirePermission('ui.screen');
      requireNamespaced(contribution.id);
      additions.screens.push({
        id: contribution.id,
        title: contribution.title,
        group: contribution.group,
        ready: true,
        ...(contribution.icon === undefined ? {} : { icon: contribution.icon }),
        ...(contribution.order === undefined ? {} : { order: contribution.order }),
        kind: 'plugin',
        pluginId,
        layout: contribution.layout,
        chrome: contribution.chrome,
        shell: contribution.shell ?? 'default',
        load: contribution.load,
      });
    },
    registerHomeBlock(contribution) {
      requirePermission('ui.home');
      requireNamespaced(contribution.id);
      additions.homeBlocks.push({
        id: contribution.id,
        title: contribution.title,
        pluginId,
        order: contribution.order ?? 100,
        span: contribution.span ?? 1,
        load: contribution.load,
      });
    },
    registerCommand(contribution) {
      requirePermission('command');
      requireNamespaced(contribution.id);
      const runContext: CommandRunContext = {
        navigate: host.navigate,
        data: host.data,
        storage,
        now: () => appClock.now(),
        newId,
      };
      additions.commands.push({
        id: contribution.id,
        title: contribution.title,
        ...(contribution.hint === undefined ? {} : { hint: contribution.hint }),
        ...(contribution.shortcut === undefined ? {} : { shortcut: contribution.shortcut }),
        source: pluginId,
        run: () => contribution.run(runContext),
      });
    },
    registerSlot(contribution) {
      requirePermission('ui.slot');
      requireNamespaced(contribution.id);
      additions.slots.push({
        id: contribution.id,
        pluginId,
        slot: contribution.slot,
        order: contribution.order ?? 0,
        load: contribution.load,
      });
    },
    registerTheme(contribution) {
      requirePermission('ui.theme');
      requireNamespaced(contribution.id);
      additions.themes.push({ ...contribution, pluginId });
    },
    registerCss(contribution) {
      requirePermission('ui.css');
      additions.css.push({ ...contribution, pluginId });
    },
    registerContentModule(contribution) {
      additions.content.push({
        id: contribution.id,
        pluginId,
        kind: contribution.kind,
        name: contribution.name,
        ...(contribution.screenId === undefined ? {} : { screenId: contribution.screenId }),
        collections: [...contribution.collections],
        search: contribution.search,
      });
    },
    registerConverter(contribution) {
      requirePermission('converter');
      additions.converters.push({
        id: contribution.id,
        pluginId,
        title: contribution.title,
        from: [...contribution.from],
        to: contribution.to,
        ...(contribution.worker === undefined ? {} : { worker: contribution.worker }),
        needsDesktopBridge: contribution.needsDesktopBridge ?? false,
      });
    },
    registerConnector(contribution) {
      requirePermission('connector');
      additions.connectors.push({
        id: contribution.id,
        pluginId,
        title: contribution.title,
        protocol: contribution.protocol,
        needsDesktopBridge: contribution.needsDesktopBridge ?? false,
      });
    },
    registerScanHandler(contribution) {
      requirePermission('scan.handle');
      additions.scanHandlers.set(contribution.id, contribution);
    },
    registerData(contract) {
      requirePermission('data.provide');
      additions.dataContracts.push({
        id: contract.id,
        version: contract.version,
        providerId: pluginId,
        source: 'plugin',
        query: contract.query,
        revision: contract.revision,
      });
      additions.dataProviders.push({
        id: contract.id,
        version: contract.version,
        summary: contract.summary,
        providerId: pluginId,
        source: 'plugin',
      });
    },
    registerOcrProvider(provider) {
      requirePermission('ocr');
      additions.ocr.push(provider);
    },
    registerAiProvider(provider) {
      requirePermission('ai');
      additions.ai.push(provider);
    },
    log(message, detail) {
      console.info(`[external:${pluginId}] ${message}`, detail ?? '');
    },
  };
}

async function activateModule(
  module: Record<string, unknown>,
  status: PluginStatus,
  host: ExternalActivationHost,
  additions: ExternalAdditions,
): Promise<boolean> {
  const candidate = module.pluginModule;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof (candidate as { activate?: unknown }).activate !== 'function'
  ) {
    return false;
  }
  const plugin = candidate as PluginModule;
  if (plugin.manifest.id !== status.id) {
    throw new Error(
      `renderer 的 pluginModule id ${plugin.manifest.id} 与 manifest ${status.id} 不一致`,
    );
  }
  await plugin.activate(createExternalContext(plugin, host, additions));
  for (const kind of plugin.manifest.provides?.printBlocks ?? []) {
    additions.printBlockOwners.push({
      kind,
      pluginId: status.id,
      name: status.displayName,
      enabled: true,
    });
  }
  for (const prefix of plugin.manifest.provides?.scanPayloads ?? []) {
    if (!Object.hasOwn(additions.scanPayloadOwners, prefix)) {
      additions.scanPayloadOwners[prefix] = status.id;
    }
  }
  return true;
}

export function externalHostOrigin(): string {
  return `${window.location.protocol}//${window.location.hostname}:${HOST_PORT}`;
}

function rendererUrl(
  plugin: { packageName: string; renderer: string | null },
  version: number,
): string | null {
  if (!plugin.renderer) return null;
  const relative = plugin.renderer.replaceAll('\\', '/').replace(/^\.?\//, '');
  const segments = relative.split('/').map((segment) => encodeURIComponent(segment));
  return `${externalHostOrigin()}/plugins/${encodeURIComponent(plugin.packageName)}/${segments.join('/')}?v=${version}`;
}

const rendererCache = new Map<string, Promise<Record<string, unknown>>>();

function loadRenderer(plugin: { packageName: string; renderer: string | null }, version: number) {
  const url = rendererUrl(plugin, version);
  if (!url) return Promise.reject(new Error(`插件 ${plugin.packageName} 没有 gofor.renderer`));
  const cached = rendererCache.get(url);
  if (cached) return cached;
  const promise = import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
  rendererCache.set(url, promise);
  return promise;
}

function componentOf(
  module: Record<string, unknown>,
  name: string,
): PluginComponent<PluginScreenProps> | null {
  const value = module[name] ?? module.default;
  return typeof value === 'function' ? (value as PluginComponent<PluginScreenProps>) : null;
}

function slotComponentOf(
  module: Record<string, unknown>,
  name: string,
): PluginComponent<PluginSlotProps> | null {
  const value = module[name] ?? module.default;
  return typeof value === 'function' ? (value as PluginComponent<PluginSlotProps>) : null;
}

async function fetchSnapshot(): Promise<ExternalSnapshot | null> {
  try {
    const response = await fetch(`${externalHostOrigin()}/api/plugins/snapshot`, {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return null;
    return (await response.json()) as ExternalSnapshot;
  } catch {
    return null;
  }
}

export function externalPluginsEnabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('external') === '1') return true;
    return window.localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExternalPluginsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // 隐私模式下写不进去；本次仍可通过 ?external=1 使用。
  }
}

export async function loadExternalPlugins(
  host: ExternalActivationHost,
): Promise<ExternalAdditions | null> {
  if (!externalPluginsEnabled()) return null;
  const snapshot = await fetchSnapshot();
  if (!snapshot) return null;

  const conflicts: string[] = [];
  const screens: ScreenEntry[] = [];
  const homeBlocks: RegisteredHomeBlock[] = [];
  const themes: RegisteredTheme[] = [];
  const slots: RegisteredSlot[] = [];
  const commands: HostCommand[] = [];
  const css: RegisteredCss[] = [];
  const content: RegisteredContent[] = [];
  const converters: RegisteredConverter[] = [];
  const connectors: RegisteredConnector[] = [];
  const ocr: OcrProvider[] = [];
  const ai: AiProvider[] = [];
  const printBlockOwners: PrintBlockOwnerInfo[] = [];
  const scanPayloadOwners: Record<string, string> = {};
  const plugins: PluginInfo[] = [];
  const dataContracts: DataContractEntry[] = [];
  const dataProviders: DataProviderSummary[] = [];
  const scanHandlers = new Map<string, ScanHandlerContribution>();

  const version = snapshot.version;
  const activeById = new Map(
    snapshot.plugins
      .filter((plugin) => plugin.state === 'active')
      .map((plugin) => [plugin.id, plugin]),
  );

  for (const status of snapshot.plugins) {
    plugins.push({
      id: status.id,
      name: status.displayName,
      version: status.version,
      kind: 'installed',
      enabled: status.state === 'active',
      permissions: [...status.permissions],
      unknownPermissions: [],
      activationError: status.error,
      blockedReason: status.state === 'incompatible' ? status.error : null,
      consumes: [],
      providesData: [],
      screens: snapshot.screens.filter((screen) => screen.pluginId === status.id).map((s) => s.id),
      printBlocks: [],
      commands: snapshot.commands
        .filter((command) => command.pluginId === status.id)
        .map((c) => c.id),
      contentModules: [],
      themes: snapshot.themes.filter((theme) => theme.pluginId === status.id).map((t) => t.id),
      converters: [],
      installedAt: 0,
      external: true,
      packageName: status.packageName,
    });
  }

  // 迁移后的构建期插件：renderer 导出完整 pluginModule，用宿主 PluginContext 原样激活。
  const activated = new Set<string>();
  const moduleManifests = new Map<string, PluginModule['manifest']>();
  for (const status of snapshot.plugins) {
    if (status.state !== 'active' || status.renderer === null) continue;
    try {
      const module = await loadRenderer(
        { packageName: status.packageName, renderer: status.renderer },
        version,
      );
      const candidate = module.pluginModule as PluginModule | undefined;
      if (candidate?.manifest) moduleManifests.set(status.id, candidate.manifest);
      if (
        await activateModule(module, status, host, {
          screens,
          homeBlocks,
          themes,
          slots,
          commands,
          css,
          content,
          converters,
          connectors,
          ocr,
          ai,
          printBlockOwners,
          scanPayloadOwners,
          plugins,
          dataContracts,
          dataProviders,
          scanHandlers,
          conflicts,
        })
      ) {
        activated.add(status.id);
      }
    } catch (error) {
      conflicts.push(`插件 ${status.id} 激活失败：${String(error)}`);
    }
  }

  for (const screen of snapshot.screens) {
    if (activated.has(screen.pluginId)) continue;
    if (!activeById.has(screen.pluginId)) continue;
    screens.push({
      id: screen.id,
      title: screen.title,
      group: screen.group,
      ready: true,
      ...(screen.icon === undefined ? {} : { icon: screen.icon }),
      ...(screen.order === undefined ? {} : { order: screen.order }),
      kind: 'plugin',
      pluginId: screen.pluginId,
      layout: screen.layout ?? 'content',
      chrome: screen.chrome ?? 'default',
      shell: 'default',
      load: async () => {
        const module = await loadRenderer(screen, version);
        const component = componentOf(module, screen.component);
        if (!component) throw new Error(`renderer 没有导出组件 ${screen.component}`);
        return { default: component };
      },
    });
  }

  for (const theme of snapshot.themes) {
    if (!activeById.has(theme.pluginId) || activated.has(theme.pluginId)) continue;
    themes.push({ ...theme, pluginId: theme.pluginId });
  }

  for (const slot of snapshot.slots) {
    if (!activeById.has(slot.pluginId) || activated.has(slot.pluginId) || !slot.renderer) continue;
    slots.push({
      id: `${slot.pluginId}/${slot.slotId}`,
      pluginId: slot.pluginId,
      slot: slot.slotId as RegisteredSlot['slot'],
      order: 0,
      load: async () => {
        const module = await loadRenderer(
          { packageName: slot.packageName, renderer: slot.renderer },
          version,
        );
        const component = slotComponentOf(module, slot.componentName);
        if (!component) throw new Error(`renderer 没有导出插槽组件 ${slot.componentName}`);
        return { default: component };
      },
    });
  }

  for (const command of snapshot.commands) {
    if (!activeById.has(command.pluginId) || activated.has(command.pluginId)) continue;
    commands.push({
      id: command.id,
      title: command.title,
      source: command.pluginId,
      run: async () => {
        const response = await fetch(`${externalHostOrigin()}/api/plugins/run-command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: command.id }),
        });
        if (!response.ok) throw new Error(`命令 ${command.id} 执行失败`);
      },
    });
  }

  for (const data of snapshot.data) {
    if (!activeById.has(data.pluginId) || activated.has(data.pluginId)) continue;
    dataProviders.push({
      id: data.id,
      version: data.version,
      summary: data.summary,
      providerId: data.pluginId,
      source: 'plugin',
    });
    dataContracts.push({
      id: data.id,
      version: data.version,
      providerId: data.pluginId,
      source: 'plugin',
      query: async (input) => {
        const module = await loadRenderer(
          {
            packageName: data.packageName,
            renderer: activeById.get(data.pluginId)?.renderer ?? null,
          },
          version,
        );
        const providers = module.data as
          | Record<string, { query?: (value: unknown) => Promise<unknown> }>
          | undefined;
        const query = providers?.[data.id]?.query;
        if (!query) return null;
        return await query(input);
      },
      revision: async () => {
        const module = await loadRenderer(
          {
            packageName: data.packageName,
            renderer: activeById.get(data.pluginId)?.renderer ?? null,
          },
          version,
        );
        const providers = module.data as
          | Record<string, { revision?: () => Promise<number> }>
          | undefined;
        return (await providers?.[data.id]?.revision?.()) ?? 0;
      },
    });
  }

  for (const handler of snapshot.scanHandlers) {
    const status = activeById.get(handler.pluginId);
    if (!status?.renderer) {
      conflicts.push(`插件 ${handler.pluginId} 声明了扫描 handler，但没有 gofor.renderer`);
      continue;
    }
    let module: Record<string, unknown>;
    try {
      module = await loadRenderer(
        { packageName: handler.packageName, renderer: status.renderer },
        version,
      );
    } catch (error) {
      conflicts.push(`插件 ${handler.pluginId} 的 renderer 加载失败：${String(error)}`);
      continue;
    }
    const handlers = module.scanHandlers as
      | Record<
          string,
          (
            results: Parameters<ScanHandlerContribution['handle']>[0],
            context: Parameters<ScanHandlerContribution['handle']>[1],
          ) => ReturnType<ScanHandlerContribution['handle']>
        >
      | undefined;
    const handle = handlers?.[handler.id];
    if (!handle) {
      conflicts.push(`插件 ${handler.pluginId} 的 renderer 没有导出 ${handler.id}`);
      continue;
    }
    scanHandlers.set(handler.owner, { id: handler.id, handle });
  }

  // 用 renderer 的完整 manifest 补齐安装页信息（external 主进程清单只有声明字段）。
  for (const info of plugins) {
    const manifest = moduleManifests.get(info.id);
    if (!manifest) continue;
    info.permissions = [...manifest.permissions];
    info.printBlocks = [...(manifest.provides?.printBlocks ?? [])];
    info.unknownPermissions = unknownPermissions(manifest.permissions);
    info.consumes = describeDataDependencies(manifest.consumes?.data ?? [], dataContracts);
    info.blockedReason = info.consumes.some(
      (dependency) => !dependency.optional && dependency.availability.status !== 'available',
    )
      ? '缺少依赖的数据插件'
      : null;
    info.providesData = dataContracts
      .filter((contract) => contract.providerId === info.id)
      .map((contract) => ({
        id: contract.id,
        version: contract.version,
        summary: dataProviders.find((provider) => provider.id === contract.id)?.summary ?? '',
      }));
    info.screens = screens
      .filter((screen) => screen.pluginId === info.id)
      .map((screen) => screen.id);
    info.commands = commands
      .filter((command) => command.source === info.id)
      .map((command) => command.id);
    info.themes = themes.filter((theme) => theme.pluginId === info.id).map((theme) => theme.id);
    info.contentModules = content
      .filter((module) => module.pluginId === info.id)
      .map((module) => module.id);
    info.converters = converters
      .filter((converter) => converter.pluginId === info.id)
      .map((converter) => converter.id);
  }

  return {
    screens,
    homeBlocks,
    themes,
    slots,
    commands,
    css,
    content,
    converters,
    connectors,
    ocr,
    ai,
    printBlockOwners,
    scanPayloadOwners,
    plugins,
    dataContracts,
    dataProviders,
    scanHandlers,
    conflicts,
  };
}
