import type { DataClient, DataContract } from './data.ts';
import type { PluginStoreLike } from './store.ts';

/**
 * 结构化组件类型（零 React 依赖）。
 *
 * 契约包不 import React：它要能被 Node 单测、被 core 的类型检查直接引用，
 * 而不是把 React 的 peer 依赖传染给整条依赖链。宿主在渲染时会转成
 * `ComponentType`（见 apps/web/src/plugins/host.tsx）。
 */
export type PluginComponent<P> = (props: P) => unknown;

/* --------------------------------------------------------------- 存储 */

/**
 * 插件自己的键值存储。
 *
 * 键是 `(collection, key)`，落到 Dexie 的 `pluginData` 表（一个通用容器）。
 * 插件**不能**自己开表：Dexie 版本号一旦发布就冻结，让插件开表等于把
 * 版本管理交给插件。值必须是可 JSON 序列化的东西（备份就是 JSON）。
 */
export interface PluginStorageEntry<T = unknown> {
  key: string;
  value: T;
}

export interface PluginStorage {
  get<T = unknown>(collection: string, key: string): Promise<T | null>;
  put(collection: string, key: string, value: unknown): Promise<void>;
  list<T = unknown>(collection: string): Promise<PluginStorageEntry<T>[]>;
  delete(collection: string, key: string): Promise<void>;
  /** 只清本插件的全部数据。 */
  clear(): Promise<void>;
}

/* ------------------------------------------------------------- 屏幕 */

/** 外壳变体：插件只能选宿主给的这几种，不能自己接管外壳。 */
export type ShellVariant = 'default' | 'compact' | 'sidebar-right' | 'focus';

export interface PluginScreenProps {
  /** 当前插件 id。 */
  pluginId: string;
  /** 完整页面 id（`<pluginId>/<screenId>`）。 */
  screenId: string;
  host: PluginScreenHost;
}

/** 页面能拿到的宿主能力（与命令、插槽用的是同一套，避免三个真相）。 */
export interface PluginScreenHost {
  navigate(screenId: string): void;
  /** 浏览器后退（没有历史时由宿主退回首页）。 */
  back(): void;
  /** 注入的时钟；插件禁止直接 `Date.now()`（与 core 的 Clock 约定一致）。 */
  now(): number;
  /** 注入的 id 生成器（不要自己写 Math.random）。 */
  newId(): string;
  data: DataClient;
  storage: PluginStorage;
  store: PluginStoreLike;
  /** 扫描回填：按结果 owner 分发给各插件；缺插件时返回 missing。 */
  applyScan(results: readonly ScanHandlerResult[], date: string): Promise<ScanDispatchSummary>;
}

export interface PluginScreenModule {
  default: PluginComponent<PluginScreenProps>;
}

/**
 * 独占页面贡献项。
 *
 * - `layout`：`content` 保留内容区内边距，`full` 占满内容区；
 * - `chrome`：`none` 连侧栏和页头一起让出（**但打印层永远在外壳之外**，
 *   不能被卷进 `.screen-only`，那是 P1 打白纸事故）；
 * - `shell`：host 提供的三种布局变体，插件不能自定义任意外壳。
 */
export interface ScreenContribution {
  /** 必须是 `<pluginId>/<screenId>`，避开 core 的 ScreenId union（`apps/web/src/nav.ts`）。 */
  id: string;
  title: string;
  /** 导航分组编码（例如 `离线·M1`）；不认识的编码会落到「插件」分组。 */
  group: string;
  icon?: string;
  /** 分组内排序，小的在前；不写就排在组末（运行时插件的默认）。 */
  order?: number;
  layout: 'content' | 'full';
  chrome: 'default' | 'none';
  shell?: ShellVariant;
  load: () => Promise<PluginScreenModule>;
}

/* ------------------------------------------------------------- 命令 */

export interface CommandRunContext {
  navigate(screenId: string): void;
  data: DataClient;
  storage: PluginStorage;
  now(): number;
  newId(): string;
}

export interface CommandContribution {
  /** 必须是 `<pluginId>/<commandId>`。 */
  id: string;
  title: string;
  hint?: string;
  /**
   * 快捷键，形如 `Mod+K` / `Mod+Shift+P` / `Escape`。
   * `Mod` = macOS 的 ⌘ / 其它平台的 Ctrl。冲突由宿主检测并展示，不静默覆盖。
   */
  shortcut?: string;
  run(context: CommandRunContext): void | Promise<void>;
}

/* ------------------------------------------------------------ 首页块 */

/** 首页内容块的宿主能力。 */
export interface HomeBlockProps {
  pluginId: string;
  blockId: string;
  host: PluginScreenHost;
}

export interface HomeBlockModule {
  default: PluginComponent<HomeBlockProps>;
}

/**
 * 首页内容贡献项。
 *
 * 首页不再写死任务/打卡/课表/统计；core 只负责按 order + 用户拖拽顺序排列。
 * 每个块的标题由插件给，右侧拖拽手柄由 core 渲染。
 */
export interface HomeBlockContribution {
  /** 必须是 `<pluginId>/<blockId>`。 */
  id: string;
  title: string;
  /** 默认排序，小的在前。 */
  order?: number;
  /** 1/2 列；首页网格在窄屏仍是一列。 */
  span?: 1 | 2;
  load: () => Promise<HomeBlockModule>;
}

/* ------------------------------------------------------------- 插槽 */

export const SLOT_NAMES = ['home.after-stats', 'app.header.right', 'app.sidebar.footer'] as const;

export type FixedSlotName = (typeof SLOT_NAMES)[number];
/** `screen.<screenId>.after`：任意页面底部。 */
export type SlotName = FixedSlotName | `screen.${string}.after`;

export interface PluginSlotProps {
  pluginId: string;
  host: PluginScreenHost;
}

export interface PluginSlotModule {
  default: PluginComponent<PluginSlotProps>;
}

export interface SlotContribution {
  /** 必须是 `<pluginId>/<slotId>`。 */
  id: string;
  slot: SlotName;
  /** 小的排前面；相同则按插件 id 排，保证顺序稳定。 */
  order?: number;
  load: () => Promise<PluginSlotModule>;
}

/* ------------------------------------------------------- 主题 / CSS */

/**
 * 主题 token 包（档 1）。
 *
 * 只允许覆盖 token 变量，且只作用于屏幕层容器：纸面色是硬编码的，
 * 插件没有路径改到纸上（启用主题后 `day-sheet.pdf` 必须一模一样）。
 */
export interface ThemeContribution {
  /** 必须是 `<pluginId>/<themeId>`。 */
  id: string;
  name: string;
  tokens: Readonly<Record<string, string>>;
}

/**
 * 作用域 CSS（档 3）。
 *
 * `css` 里只写选择器与声明，宿主负责包 `@media screen { @scope (...) { … } }`。
 * 因此插件写不出打印样式，也碰不到自己那块以外的 DOM。
 */
export interface CssContribution {
  /** 必须是 `<pluginId>/<cssId>`。 */
  id: string;
  css: string;
}

/* ------------------------------------------------- 内容模块 / 转换器 */

export type ContentModuleKind = 'notebook' | 'wordbook' | 'file-view';

export interface ContentSearchHit {
  moduleId: string;
  title: string;
  snippet: string;
  /** 能跳过去的页面 id（可选）。 */
  screenId?: string;
}

/**
 * 内容模块插件类型（P3-3.7）。
 *
 * 数据落在 `pluginData` 的 `collections` 里，由备份切片统一带上；
 * 跨插件检索走 `search()`，不要求调用方知道数据形状。
 */
export interface ContentModuleContribution {
  id: string;
  kind: ContentModuleKind;
  name: string;
  /** 这个模块的主页面（可选）。 */
  screenId?: string;
  /** 会写的 pluginData 集合，安装页与备份说明展示。 */
  collections: string[];
  search(query: string): Promise<ContentSearchHit[]>;
}

export interface ConverterInput {
  name: string;
  mime: string;
  text: string;
}

export interface ConverterOutput {
  name: string;
  mime: string;
  text: string;
}

export interface ConverterJob {
  converterId: string;
  input: ConverterInput;
}

/**
 * 转换器（P3-3.8）。
 *
 * `worker` 是宿主内置 Worker 里的任务 id：能跑在 Worker 里的转换必须用这条路径，
 * 否则一个死循环会把整个页面卡死。没有 `worker` 的转换器只能走桌面桥，
 * PWA 下宿主明确显示「网页版不能转换」，而不是转一半失败。
 */
export interface ConverterContribution {
  id: string;
  title: string;
  from: string[];
  to: string;
  /** 宿主 Worker 支持的任务 id；运行时插件一般给不出，需 `needsDesktopBridge`。 */
  worker?: string;
  needsDesktopBridge?: boolean;
}

/** 连接器（P3-3.8，P7 才真正接 QQ 之类）：契约先定，默认关闭。 */
export interface ConnectorContribution {
  id: string;
  title: string;
  protocol: string;
  needsDesktopBridge: boolean;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}

/* ------------------------------------------------------ OCR / AI */

/** 3.6：只定接口 + 「未配置」默认实现，本阶段不写任何网络代码。 */
export type ProviderStatus =
  | { status: 'ready'; name: string }
  | { status: 'not-configured' }
  | { status: 'unavailable'; reason: string };

export interface OcrInput {
  /** data URL 或本地对象 URL；provider 自己决定怎么读。 */
  image: string;
  language?: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrProvider {
  id: string;
  name: string;
  status(): ProviderStatus;
  recognize(input: OcrInput): Promise<OcrResult>;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  id: string;
  name: string;
  status(): ProviderStatus;
  complete(messages: AiMessage[]): Promise<string>;
}

/** 数据能力注册项（插件在 activate 里注册）。 */
export type { DataContract };

/* ------------------------------------------------------------- 扫描回填 */

/**
 * 一条识别结果（结构上与 `@gofor/core/domain` 的 `ScanResult` 兼容）。
 *
 * 契约包不 import core（core 依赖 plugin-api，反向会成环），所以这里只声明
 * 回填处理器需要的字段；宿主把真正的 `ScanResult` 直接传进来。
 */
export interface ScanHandlerResult {
  targetId: string;
  label: string;
  kind: 'checkbox' | 'cell' | 'slider';
  /** 该区域内墨迹占比 0–1（handler 一般不用，但保持与 core 的 ScanResult 同形）。 */
  ink: number;
  selected: boolean;
  payload?: string | null;
  value?: number;
  /** 这个格子由哪个插件负责；旧清单没有该字段时宿主按 payload 前缀回退。 */
  owner?: string;
}

export interface ScanHandlerOutcome {
  /** 真正写进去的条目数。 */
  handled: number;
  /** 识别出来了但对应数据不存在/不认识的条目数。 */
  skipped: number;
}

export interface ScanHandlerContext {
  /** 纸上印的日期（不是扫描时间）。 */
  date: string;
  now(): number;
}

/**
 * 扫描处理器：纸面区块的 owner 插件负责把自己的结果写回自己的数据。
 *
 * 为什么不让 core 统一写：区块已经归插件所有，插件被禁用时写回就不该发生；
 * 由插件注册处理器，宿主只做路由与"缺失插件"的表达。
 */
export interface ScanHandlerContribution {
  /** 必须是 `<pluginId>/scan`。 */
  id: string;
  handle(
    results: readonly ScanHandlerResult[],
    context: ScanHandlerContext,
  ): Promise<ScanHandlerOutcome>;
}

/** 宿主把一批结果按 owner 分发后的汇总（确认页显示用）。 */
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
  parts: ScanDispatchPart[];
  missing: ScanDispatchMissing[];
  errors: string[];
}
