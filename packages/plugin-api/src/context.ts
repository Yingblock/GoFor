import type {
  AiProvider,
  CommandContribution,
  ConnectorContribution,
  ContentModuleContribution,
  ConverterContribution,
  CssContribution,
  OcrProvider,
  ScanHandlerContribution,
  ScreenContribution,
  SlotContribution,
  ThemeContribution,
} from './contributions.ts';
import type { DataClient, DataContract } from './data.ts';
import type { PluginManifest } from './manifest.ts';

/**
 * 插件激活时拿到的宿主上下文。
 *
 * 注册项**立即生效**：activate 正常返回后宿主就把它算进注册表；
 * activate 抛错则整个插件算启用失败，页面显示原因而不是白屏。
 * `deactivate()` 由宿主在禁用/卸载/重载前调用，插件要自己取消定时器与订阅。
 */
export interface PluginContext {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  readonly permissions: readonly string[];
  /** 只读数据（插件之间唯一的取数路径）。 */
  readonly data: DataClient;
  /** 插件自己的键值存储（命名空间由宿主按 pluginId 隔离）。 */
  readonly storage: PluginStorageLike;
  /** 注入的时钟；插件不允许直接 `Date.now()`。 */
  readonly now: () => number;
  /** 注入的 id 生成器；插件不要自己写 Math.random。 */
  readonly newId: () => string;

  registerScreen(contribution: ScreenContribution): void;
  registerCommand(contribution: CommandContribution): void;
  registerSlot(contribution: SlotContribution): void;
  registerTheme(contribution: ThemeContribution): void;
  registerCss(contribution: CssContribution): void;
  registerContentModule(contribution: ContentModuleContribution): void;
  registerConverter(contribution: ConverterContribution): void;
  registerConnector(contribution: ConnectorContribution): void;
  /** 注册扫描回填处理器（需要 `scan.handle` 权限）。 */
  registerScanHandler(contribution: ScanHandlerContribution): void;
  /** 提供只读数据能力（需要 `data.provide` 权限）。 */
  registerData(contract: DataContract): void;
  registerOcrProvider(provider: OcrProvider): void;
  registerAiProvider(provider: AiProvider): void;

  /** 打到控制台并带插件 id；安装页的「最近错误」会展示最后一条。 */
  log(message: string, detail?: unknown): void;
}

/** 与 `PluginStorage` 同形，单独列在这里避免 context 文件反向依赖工具栏。 */
export interface PluginStorageLike {
  get<T = unknown>(collection: string, key: string): Promise<T | null>;
  put(collection: string, key: string, value: unknown): Promise<void>;
  list<T = unknown>(collection: string): Promise<Array<{ key: string; value: T }>>;
  delete(collection: string, key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 插件模块：npm 包默认导出这个形状。
 *
 * 构建期插件可以正常 import 仓库的包；没有运行时单文件加载，
 * 也没有 `window.GoForSDK`。
 */
export interface PluginModule {
  manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
