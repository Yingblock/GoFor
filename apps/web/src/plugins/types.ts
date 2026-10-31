import type { ScanResult } from '@gofor/core/domain';
import type { DataDependencyStatus, ShortcutConflict } from '@gofor/core/plugin';
import type { PrintBlockOwnerRule } from '@gofor/core/print';
import type {
  AiProvider,
  CommandContribution,
  ContentModuleContribution,
  ContentModuleKind,
  CssContribution,
  DataClient,
  HomeBlockContribution,
  OcrProvider,
  PluginScreenModule,
  PluginStorage,
  PluginStoreLike,
  ScreenContribution,
  ShellVariant,
  SlotContribution,
  SlotName,
  ThemeContribution,
} from '@gofor/plugin-api';
import type { ComponentType } from 'react';
import type { NavGroup } from '../nav.ts';

/** 宿主里的一个页面条目：内核页面和插件页面走同一张表。 */
export interface ScreenEntry {
  id: string;
  title: string;
  group: string;
  ready: boolean;
  icon?: string;
  order?: number;
  kind: 'core' | 'plugin';
  pluginId?: string;
  layout: 'content' | 'full';
  chrome: 'default' | 'none';
  shell: ShellVariant;
  /** 插件页面才有；内核页面由 App 自己的 renderer 表渲染。 */
  load?: () => Promise<PluginScreenModule>;
}

/** 命令面板 / 快捷键共用的一份命令。 */
export interface HostCommand {
  id: string;
  title: string;
  hint?: string;
  /** 形如 `Mod+K`；冲突由宿主检测并展示。 */
  shortcut?: string;
  /** `core` 或插件 id。 */
  source: string;
  run(): void | Promise<void>;
}

export interface RegisteredHomeBlock {
  id: string;
  title: string;
  pluginId: string;
  order: number;
  span: 1 | 2;
  load: HomeBlockContribution['load'];
}

export interface RegisteredSlot {
  id: string;
  pluginId: string;
  slot: SlotName;
  order: number;
  load: SlotContribution['load'];
}

export interface RegisteredTheme extends ThemeContribution {
  pluginId: string;
}

export interface RegisteredCss extends CssContribution {
  pluginId: string;
}

export interface RegisteredContent {
  id: string;
  pluginId: string;
  kind: ContentModuleKind;
  name: string;
  screenId?: string;
  collections: string[];
  search: ContentModuleContribution['search'];
}

export interface RegisteredConverter {
  id: string;
  pluginId: string;
  title: string;
  from: string[];
  to: string;
  worker?: string;
  needsDesktopBridge: boolean;
}

export interface RegisteredConnector {
  id: string;
  pluginId: string;
  title: string;
  protocol: string;
  needsDesktopBridge: boolean;
}

/** 安装页展示的插件信息（不包含函数，避免 UI 依赖运行态对象）。 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  kind: 'builtin' | 'installed';
  /** 运行时外部插件（来自 plugin-host），不能在本页启用/禁用。 */
  external?: boolean;
  /** 外部插件的 npm 包名；用于启停。 */
  packageName?: string;
  enabled: boolean;
  permissions: string[];
  unknownPermissions: string[];
  activationError: string | null;
  /** 依赖缺失/被禁用/版本不匹配时的一句话。 */
  blockedReason: string | null;
  consumes: DataDependencyStatus[];
  providesData: Array<{ id: string; version: number; summary: string }>;
  screens: string[];
  printBlocks?: string[];
  commands: string[];
  contentModules: string[];
  themes: string[];
  converters: string[];
  installedAt: number;
}

/** 一个数据 provider 的摘要（安装页展示"现在有谁能提供什么数据"）。 */
export type PrintBlockOwnerInfo = PrintBlockOwnerRule;

export interface ScanDispatchPart {
  pluginId: string;
  name: string;
  handled: number;
}

export interface ScanDispatchMissing {
  pluginId: string;
  name: string;
  count: number;
}

export interface ScanDispatchSummary {
  handled: number;
  skipped: number;
  /** 实际写回的插件与条数（给确认页显示）。 */
  parts: ScanDispatchPart[];
  /** owner 插件未安装/被禁用：这些条目没有写，必须显示出来。 */
  missing: ScanDispatchMissing[];
  /** 处理器抛错：不能假装成功。 */
  errors: string[];
}

export interface DataProviderSummary {
  id: string;
  version: number;
  summary: string;
  providerId: string;
  source: 'core' | 'plugin';
}

/** 宿主快照：所有渲染都读它，重建时整体替换。 */
export interface HostSnapshot {
  ready: boolean;
  bootstrapError: string | null;
  /** 每次重建 +1，React 用它触发依赖数据可用性的重渲染。 */
  version: number;
  plugins: PluginInfo[];
  screens: ScreenEntry[];
  nav: NavGroup[];
  commands: HostCommand[];
  shortcuts: ShortcutConflict[];
  /** 注册冲突 / 数据 provider 冲突等需要告诉用户的问题。 */
  conflicts: string[];
  homeBlocks: RegisteredHomeBlock[];
  slots: RegisteredSlot[];
  themes: RegisteredTheme[];
  css: RegisteredCss[];
  content: RegisteredContent[];
  converters: RegisteredConverter[];
  connectors: RegisteredConnector[];
  activeTheme: RegisteredTheme | null;
  dataProviders: DataProviderSummary[];
  /** 打印区块归属：kind → 插件（含被禁用的，用于"缺失插件"警告）。 */
  printBlockOwners: PrintBlockOwnerInfo[];
  /** 旧纸 payload 前缀 → 插件归属；由启用插件的 manifest 汇总。 */
  scanPayloadOwners: Record<string, string>;
  ocr: OcrProvider;
  ai: AiProvider;
}

/**
 * 宿主对页面/命令/插槽暴露的 API。
 *
 * 构建期插件（npm 包）通过宿主上下文拿到同一套能力；
 * 没有运行时单文件加载，也没有 `window.GoForSDK`。
 */
export interface PluginHostApi extends HostSnapshot {
  data: DataClient;
  /** 扫描回填：按结果 owner 路由到插件处理器；缺插件时明确返回 missing。 */
  applyScan(results: readonly ScanResult[], date: string): Promise<ScanDispatchSummary>;
  navigate(screenId: string): void;
  back(): void;
  now(): number;
  newId(): string;
  storageFor(pluginId: string): PluginStorage;
  storeFor(pluginId: string): PluginStoreLike;
  registerCoreCommands(commands: HostCommand[]): void;
  setPluginEnabled(id: string, enabled: boolean): Promise<void>;
  setExternalPluginEnabled(id: string, enabled: boolean, packageName?: string): Promise<void>;
  reloadPlugins(): Promise<void>;
}

export type {
  CommandContribution,
  ComponentType,
  ScreenContribution,
  SlotContribution,
  ThemeContribution,
};
