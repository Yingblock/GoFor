/**
 * 构建期插件的数据能力入口。
 *
 * 插件不能 import `@gofor/store`；所有数据操作都通过宿主注入的 store。
 * 宿主按 pluginId + manifest 权限检查，越权调用在运行期直接抛错。
 * 方法名是内部能力名，具体签名由 `@gofor/plugin-kit/store` 的类型化包装提供。
 */
export interface PluginStoreLike {
  call<T = unknown>(operation: string, ...args: unknown[]): Promise<T>;
}
