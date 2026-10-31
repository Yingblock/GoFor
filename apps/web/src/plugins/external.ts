import type {
  PluginDataRegistration,
  PluginScanHandlerRegistration,
  PluginScreenRegistration,
  PluginStatus,
  PluginThemeRegistration,
} from '@gofor/contracts';
import type { DataContractEntry } from '@gofor/core/plugin';
import type {
  PluginComponent,
  PluginScreenProps,
  PluginSlotProps,
  ScanHandlerContribution,
} from '@gofor/plugin-api';
import type {
  DataProviderSummary,
  HostCommand,
  PluginInfo,
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

export interface ExternalAdditions {
  screens: ScreenEntry[];
  themes: RegisteredTheme[];
  slots: RegisteredSlot[];
  commands: HostCommand[];
  plugins: PluginInfo[];
  dataContracts: DataContractEntry[];
  dataProviders: DataProviderSummary[];
  scanHandlers: Map<string, ScanHandlerContribution>;
  conflicts: string[];
}

function hostOrigin(): string {
  return `${window.location.protocol}//${window.location.hostname}:${HOST_PORT}`;
}

function rendererUrl(
  plugin: { packageName: string; renderer: string | null },
  version: number,
): string | null {
  if (!plugin.renderer) return null;
  const relative = plugin.renderer.replaceAll('\\', '/').replace(/^\.?\//, '');
  const segments = relative.split('/').map((segment) => encodeURIComponent(segment));
  return `${hostOrigin()}/plugins/${encodeURIComponent(plugin.packageName)}/${segments.join('/')}?v=${version}`;
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
    const response = await fetch(`${hostOrigin()}/api/plugins/snapshot`, {
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

export async function loadExternalPlugins(): Promise<ExternalAdditions | null> {
  if (!externalPluginsEnabled()) return null;
  const snapshot = await fetchSnapshot();
  if (!snapshot) return null;

  const conflicts: string[] = [];
  const screens: ScreenEntry[] = [];
  const themes: RegisteredTheme[] = [];
  const slots: RegisteredSlot[] = [];
  const commands: HostCommand[] = [];
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
      commands: snapshot.commands
        .filter((command) => command.pluginId === status.id)
        .map((c) => c.id),
      contentModules: [],
      themes: snapshot.themes.filter((theme) => theme.pluginId === status.id).map((t) => t.id),
      converters: [],
      installedAt: 0,
      external: true,
    });
  }

  for (const screen of snapshot.screens) {
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
    if (!activeById.has(theme.pluginId)) continue;
    themes.push({ ...theme, pluginId: theme.pluginId });
  }

  for (const slot of snapshot.slots) {
    if (!activeById.has(slot.pluginId) || !slot.renderer) continue;
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
    if (!activeById.has(command.pluginId)) continue;
    commands.push({
      id: command.id,
      title: command.title,
      source: command.pluginId,
      run: async () => {
        const response = await fetch(`${hostOrigin()}/api/plugins/run-command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: command.id }),
        });
        if (!response.ok) throw new Error(`命令 ${command.id} 执行失败`);
      },
    });
  }

  for (const data of snapshot.data) {
    if (!activeById.has(data.pluginId)) continue;
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

  return {
    screens,
    themes,
    slots,
    commands,
    plugins,
    dataContracts,
    dataProviders,
    scanHandlers,
    conflicts,
  };
}
