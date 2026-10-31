import { isAbsolute, resolve, sep } from 'node:path';
import type { PluginCapability, PluginManifest } from '@gofor/contracts';

/** 核心支持的 API 版本。与 `@gofor/contracts` 的 `PLUGIN_API_VERSION` 由单测钉住。 */
export const SUPPORTED_API_VERSION = '1';

export const KNOWN_CAPABILITIES = [
  'command',
  'view-slot',
  'print-template',
  'screen',
  'theme',
  'data',
  'scan',
] as const;

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`gofor.${field} 必须是非空字符串`);
  }
  return value;
}

function optionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`gofor.${field} 必须是非空字符串`);
  }
  return value;
}

function requireRelativePath(source: Record<string, unknown>, field: string): string {
  const value = requireString(source, field);
  if (isAbsolute(value)) throw new Error(`gofor.${field} 必须是相对包根目录的路径`);
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').includes('..')) {
    throw new Error(`gofor.${field} 不能跳出包目录`);
  }
  return normalized;
}

function parseCapabilities(raw: unknown): PluginCapability[] {
  if (!Array.isArray(raw)) throw new Error('gofor.capabilities 必须是数组');
  const capabilities: PluginCapability[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !KNOWN_CAPABILITIES.includes(item as PluginCapability)) {
      throw new Error(
        `gofor.capabilities 含未知能力 ${JSON.stringify(item)}；允许：${KNOWN_CAPABILITIES.join(' / ')}`,
      );
    }
    if (capabilities.includes(item as PluginCapability)) {
      throw new Error(`gofor.capabilities 重复声明 ${item}`);
    }
    capabilities.push(item as PluginCapability);
  }
  return capabilities;
}

/**
 * 解析并校验 `package.json` 的 `gofor` 字段。
 *
 * 只做结构校验，不读文件、不 require 入口；入口是否真的导出 `activate`
 * 由 `PluginManager` 在激活前检查。错误信息要能直接写进 plugins.log。
 */
export function parsePluginManifest(raw: unknown, packageName: string): PluginManifest {
  if (!isRecord(raw)) {
    throw new Error(`${packageName} 的 package.json 缺少 gofor 字段（插件清单）`);
  }

  const id = requireString(raw, 'id');
  if (!ID_PATTERN.test(id)) {
    throw new Error(`gofor.id 非法：${id}；只允许小写字母/数字/._-，且不能以符号开头结尾`);
  }

  const manifest: PluginManifest = {
    id,
    displayName: requireString(raw, 'displayName'),
    version: requireString(raw, 'version'),
    main: requireRelativePath(raw, 'main'),
    apiVersion: requireString(raw, 'apiVersion'),
    capabilities: parseCapabilities(raw.capabilities),
  };

  if (raw.permissions !== undefined) {
    if (!Array.isArray(raw.permissions) || !raw.permissions.every((item) => typeof item === 'string')) {
      throw new Error('gofor.permissions 必须是字符串数组');
    }
    manifest.permissions = [...raw.permissions];
  }

  const description = optionalString(raw, 'description');
  if (description !== undefined) manifest.description = description;
  const author = optionalString(raw, 'author');
  if (author !== undefined) manifest.author = author;
  const homepage = optionalString(raw, 'homepage');
  if (homepage !== undefined) manifest.homepage = homepage;
  if (raw.renderer !== undefined) manifest.renderer = requireRelativePath(raw, 'renderer');

  return manifest;
}

/** 把 manifest 里的相对路径解析成包内绝对路径，并拒绝目录穿越。 */
export function resolveInsidePackage(packageDir: string, relativePath: string): string {
  const absolute = resolve(packageDir, relativePath);
  const prefix = packageDir.endsWith(sep) ? packageDir : `${packageDir}${sep}`;
  if (absolute !== packageDir && !absolute.startsWith(prefix)) {
    throw new Error(`路径 ${relativePath} 跳出了插件包目录`);
  }
  return absolute;
}
