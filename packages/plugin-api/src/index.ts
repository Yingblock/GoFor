/**
 * `@gofor/plugin-api`：插件契约（类型与常量，零运行时副作用）。
 *
 * 这里只放"插件与宿主之间说什么"，不放任何实现：
 * 版本协商 / 依赖解析 / 数据解析在 `@gofor/core/plugin`（纯逻辑，可单测），
 * 宿主、注册表、路由在 `apps/web/src/plugins/`。
 */

export type {
  FileViewRequest,
  NotebookDocument,
  WordbookEntry,
  WordbookQuery,
} from './content.ts';
export type { PluginContext, PluginModule, PluginStorageLike } from './context.ts';
export type {
  AiMessage,
  AiProvider,
  CommandContribution,
  CommandRunContext,
  ConnectorContribution,
  ContentModuleContribution,
  ContentModuleKind,
  ContentSearchHit,
  ConverterContribution,
  ConverterInput,
  ConverterJob,
  ConverterOutput,
  CssContribution,
  FixedSlotName,
  OcrInput,
  OcrProvider,
  OcrResult,
  PluginComponent,
  PluginScreenHost,
  PluginScreenModule,
  PluginScreenProps,
  PluginSlotModule,
  PluginSlotProps,
  PluginStorage,
  PluginStorageEntry,
  ProviderStatus,
  ScanDispatchMissing,
  ScanDispatchPart,
  ScanDispatchSummary,
  ScanHandlerContext,
  ScanHandlerContribution,
  ScanHandlerOutcome,
  ScanHandlerResult,
  ScreenContribution,
  ShellVariant,
  SlotContribution,
  SlotName,
  ThemeContribution,
} from './contributions.ts';
export { SLOT_NAMES } from './contributions.ts';
export type { DataAvailability, DataClient, DataContract } from './data.ts';
export type { DataContractSummary, DataDependency, PluginManifest } from './manifest.ts';
export { DATA_CONTRACT_VERSION, PLUGIN_API_VERSION } from './manifest.ts';
export {
  PERMISSION_LABELS,
  PLUGIN_PERMISSIONS,
  type PluginPermission,
  permissionLabel,
  unknownPermissions,
} from './permissions.ts';

export type { HomeBlockContribution, HomeBlockModule, HomeBlockProps } from './contributions.ts';

export type { PluginStoreLike } from './store.ts';
