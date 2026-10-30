import type { PluginPermission } from './permissions.ts';

/**
 * 插件 API 的主版本。
 *
 * 破坏性变更 = +1。插件 manifest 的 `apiVersion` 与它必须**严格相等**：
 * 宿主没有能力给旧插件做兼容层，模糊匹配只会把"不兼容"拖成运行期崩溃。
 * 结构性变更（而不是破坏性）换新的契约 id / 贡献项类型，不动这个数字。
 */
export const PLUGIN_API_VERSION = 1;

/** 数据能力契约的版本：同 id 的破坏性变更 +1。 */
export const DATA_CONTRACT_VERSION = 1;

/**
 * 数据依赖声明（manifest.consumes.data 的一项）。
 *
 * `optional` 的语义是「没有它也能用，但对应那一段要显示未安装」，
 * **不是**「读不到就当 0」。两者的区别是本项目反复踩过的静默错数据。
 */
export interface DataDependency {
  id: string;
  version: number;
  optional?: boolean;
}

/** 安装页展示用：插件声明自己会提供哪些数据，不必真的激活。 */
export interface DataContractSummary {
  id: string;
  version: number;
  summary: string;
}

/**
 * 插件清单。**纯 JSON**：会存进 `plugins` 表并随备份导出，
 * 所以这里不允许出现函数、`Date`、`Map` 之类不可序列化的东西。
 *
 * 真正的注册（带 `load()` 的函数）在 `activate()` 里做。
 */
export interface PluginManifest {
  /** 反向域名式 id，例如 `gofor.wordbook`。全局唯一，也是数据与页面的命名空间。 */
  id: string;
  name: string;
  /** 插件自己的版本，语义化版本字符串（不需要严格 semver，但建议）。 */
  version: string;
  /** 必须等于 `PLUGIN_API_VERSION`。 */
  apiVersion: number;
  description?: string;
  author?: string;
  homepage?: string;
  /** 权限必须在激活前声明；注册项会真的校验。 */
  permissions: PluginPermission[];
  /** 硬依赖：缺失/被禁用/版本不兼容时本插件不启用，安装页给出原因。 */
  dependencies?: Record<string, string>;
  /** 可选依赖：缺失不影响启用，但 `consumes.data` 的对应项显示「未安装」。 */
  optionalDependencies?: string[];
  /** 声明式摘要，只用于安装页展示；真实贡献在 activate 里注册。 */
  provides?: {
    screens?: string[];
    commands?: string[];
    data?: DataContractSummary[];
    themes?: string[];
    content?: string[];
    converters?: string[];
    /**
     * 这个插件拥有的打印区块类型（例如 `checkboxList`）。
     * 插件禁用/卸载后，这些区块在模板预览与打印里静默跳过并给出警告。
     * 纸面几何仍由 core 计算，插件只声明"归属"，不能改坐标。
     */
    printBlocks?: string[];
  };
  /** 本插件依赖哪些数据能力（跨插件读数据的唯一方式）。 */
  consumes?: {
    data?: DataDependency[];
  };
}
