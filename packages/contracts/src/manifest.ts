/**
 * GoFor 插件运行时契约（类型与常量，零运行时副作用）。
 *
 * 只放"插件与主进程之间说什么"：插件 manifest、activate/deactivate、五个 API 方法。
 * 加载器、状态机、IPC 在 `@gofor/plugin-runtime`；CLI 在 `@gofor/plugin-cli`。
 *
 * 约束：本包不允许依赖 Electron / React / Dexie / core。
 * 插件只能通过 `GoForPluginAPI` 访问宿主，不能 import 核心内部模块。
 */

/** 当前核心支持的插件 API 主版本。manifest 的 `gofor.apiVersion` 必须严格相等。 */
export const PLUGIN_API_VERSION = '1' as const;

/** 插件可以声明的能力。注册未声明的能力会激活失败（见 runtime 的注册检查）。 */
export const PLUGIN_CAPABILITIES = ['command', 'view-slot', 'print-template'] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

/**
 * `package.json` 里的 `gofor` 字段，形如：
 *
 * ```json
 * {
 *   "gofor": {
 *     "id": "plugin-tomato",
 *     "displayName": "番茄钟",
 *     "version": "0.1.0",
 *     "main": "./dist/index.js",
 *     "apiVersion": "1",
 *     "capabilities": ["view-slot", "command"]
 *   }
 * }
 * ```
 */
export interface PluginManifest {
  /** 全局唯一 id，建议 `plugin-<name>`。命令/插槽/模板的命名空间。 */
  id: string;
  displayName: string;
  version: string;
  /** 相对包根目录的入口文件，必须是打包后的 JS（不要再依赖构建期别名）。 */
  main: string;
  apiVersion: string;
  capabilities: PluginCapability[];
  description?: string;
  author?: string;
  homepage?: string;
  /**
   * 可选：渲染进程入口（相对包根目录）。
   *
   * 主进程只能通过 IPC 传"插槽元数据"，React 组件无法跨进程。渲染进程拿到
   * `{ slotId, pluginId, renderer }` 后动态 import 这个文件，取组件名对应的导出。
   */
  renderer?: string;
}

/**
 * 插件状态。每次加载/重载后由 `PluginManager.snapshot()` 提供。
 * `state = 'failed' / 'incompatible'` 时 `error` 一定有值。
 */
export interface PluginStatus {
  /** manifest.id；manifest 读不出来时退回包名。 */
  id: string;
  /** npm 包名，`gofor-plugin-*`。 */
  packageName: string;
  displayName: string;
  version: string;
  apiVersion: string;
  capabilities: PluginCapability[];
  state: PluginState;
  /** 失败原因；成功为 null。只放可序列化的短字符串，不塞堆栈。 */
  error: string | null;
  /** 成功 activate 的 Unix 毫秒时间戳；未成功为 null。 */
  activatedAt: number | null;
  /** activate 耗时（毫秒）；未成功为 null。 */
  durationMs: number | null;
}

export type PluginState = 'active' | 'failed' | 'incompatible';
