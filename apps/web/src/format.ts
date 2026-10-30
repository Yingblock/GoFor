/**
 * 兼容 shim：日期格式化已移到 `@gofor/core/print`（纯函数，宿主与插件共用）。
 * Web 内部继续从这里 import，避免一次性改几十处相对路径。
 */
export * from '@gofor/core/print';
