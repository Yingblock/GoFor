/**
 * 兼容 shim：实现已经搬到 `@gofor/plugin-kit`（插件与宿主都需要的时钟抽象）。
 * Web 内部继续从这里 import，避免一次性改几十处相对路径。
 */
export * from '@gofor/plugin-kit/clock';
