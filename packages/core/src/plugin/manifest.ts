import { PLUGIN_PERMISSIONS } from '@gofor/plugin-api';
import { isValidVersionRange, parseVersion } from './version.ts';

/**
 * manifest 校验（纯函数，安装页与内置插件都走这一条）。
 *
 * 插件现在随应用构建（npm 包），但 manifest 仍统一校验：
 * 形状与边界（id、版本、权限是否认识、依赖范围是否合法）。
 * 没有运行时单文件加载，也没有沙箱。
 */

export interface ManifestDataDependency {
  id: string;
  version: number;
  optional?: boolean;
}

/**
 * 校验后的 manifest：只保留已知字段（防止 `__proto__` 之类的脏键混进注册表），
 * 可选字段缺省时不出现（`exactOptionalPropertyTypes` 也要求这样）。
 */
export interface PluginManifestShape {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  permissions: string[];
  description?: string;
  author?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: string[];
  provides?: {
    screens?: string[];
    commands?: string[];
    data?: Array<{ id: string; version: number; summary: string }>;
    themes?: string[];
    content?: string[];
    converters?: string[];
    printBlocks?: string[];
  };
  consumes?: { data?: ManifestDataDependency[] };
}

export interface ManifestValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: PluginManifestShape | null;
}

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MAX_TEXT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, errors: string[], max = MAX_TEXT): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} 必须是非空字符串`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push(`${field} 太长（最多 ${max} 字符）`);
    return null;
  }
  return trimmed;
}

function stringArray(value: unknown, field: string, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${field} 必须是字符串数组`);
    return undefined;
  }
  return value.map((item) => (item as string).trim()).filter(Boolean);
}

/**
 * 校验并归一化 manifest。
 *
 * `expectedApiVersion` 由宿主传入；**严格相等**，不做兼容层
 * （理由见 plugin-api 的 `PLUGIN_API_VERSION` 注释）。
 */
export function validatePluginManifest(
  input: unknown,
  expectedApiVersion: number,
): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ['manifest 必须是一个对象'], warnings, manifest: null };
  }

  const id = text(input.id, 'id', errors, 80);
  if (id !== null && !PLUGIN_ID_PATTERN.test(id)) {
    errors.push('id 只能是小写字母/数字与 . - 组成（例如 gofor.wordbook）');
  }
  const name = text(input.name, 'name', errors, 80);
  const rawVersion = typeof input.version === 'string' ? input.version.trim() : '';
  if (parseVersion(rawVersion) === null) errors.push('version 必须是 x.y.z 形式的版本号');

  const apiVersion = input.apiVersion;
  if (typeof apiVersion !== 'number' || !Number.isInteger(apiVersion)) {
    errors.push('apiVersion 必须是整数');
  } else if (apiVersion !== expectedApiVersion) {
    errors.push(`插件 API 版本 ${apiVersion} 与宿主 ${expectedApiVersion} 不兼容（必须严格相等）`);
  }

  const rawPermissions = input.permissions;
  let permissions: string[] = [];
  if (!Array.isArray(rawPermissions) || rawPermissions.some((item) => typeof item !== 'string')) {
    errors.push('permissions 必须是字符串数组');
  } else {
    permissions = Array.from(new Set((rawPermissions as string[]).map((item) => item.trim())));
    for (const permission of permissions) {
      if (!PLUGIN_PERMISSIONS.includes(permission as (typeof PLUGIN_PERMISSIONS)[number])) {
        warnings.push(`宿主不认识权限 ${permission}，已忽略`);
      }
    }
  }

  const description =
    input.description === undefined
      ? undefined
      : (text(input.description, 'description', errors) ?? undefined);
  const author =
    input.author === undefined
      ? undefined
      : (text(input.author, 'author', errors, 60) ?? undefined);
  const homepage =
    input.homepage === undefined
      ? undefined
      : (text(input.homepage, 'homepage', errors, 300) ?? undefined);

  let dependencies: Record<string, string> | undefined;
  if (input.dependencies !== undefined) {
    if (!isRecord(input.dependencies)) {
      errors.push('dependencies 必须是 { 插件id: 版本范围 } 对象');
    } else {
      dependencies = {};
      for (const [dependencyId, range] of Object.entries(input.dependencies)) {
        if (!PLUGIN_ID_PATTERN.test(dependencyId)) {
          errors.push(`dependencies 里的插件 id 非法：${dependencyId}`);
          continue;
        }
        if (typeof range !== 'string' || !isValidRange(range)) {
          errors.push(`依赖 ${dependencyId} 的版本范围非法：${String(range)}`);
          continue;
        }
        if (dependencyId === id) {
          errors.push('插件不能依赖自己');
          continue;
        }
        dependencies[dependencyId] = range.trim();
      }
    }
  }

  const optionalDependencies = stringArray(
    input.optionalDependencies,
    'optionalDependencies',
    errors,
  );
  if (optionalDependencies) {
    for (const dependencyId of optionalDependencies) {
      if (!PLUGIN_ID_PATTERN.test(dependencyId)) {
        errors.push(`optionalDependencies 里的插件 id 非法：${dependencyId}`);
      }
    }
  }

  let provides: PluginManifestShape['provides'];
  if (input.provides !== undefined) {
    if (!isRecord(input.provides)) {
      errors.push('provides 必须是对象');
    } else {
      const raw = input.provides;
      provides = {};
      const screens = stringArray(raw.screens, 'provides.screens', errors);
      if (screens) provides.screens = screens;
      const commands = stringArray(raw.commands, 'provides.commands', errors);
      if (commands) provides.commands = commands;
      const themes = stringArray(raw.themes, 'provides.themes', errors);
      if (themes) provides.themes = themes;
      const content = stringArray(raw.content, 'provides.content', errors);
      if (content) provides.content = content;
      const converters = stringArray(raw.converters, 'provides.converters', errors);
      if (converters) provides.converters = converters;
      const printBlocks = stringArray(raw.printBlocks, 'provides.printBlocks', errors);
      if (printBlocks) provides.printBlocks = printBlocks;
      if (raw.data !== undefined) {
        if (!Array.isArray(raw.data)) {
          errors.push('provides.data 必须是数组');
        } else {
          const data: Array<{ id: string; version: number; summary: string }> = [];
          for (const [index, item] of raw.data.entries()) {
            if (!isRecord(item) || typeof item.id !== 'string' || item.id.trim() === '') {
              errors.push(`provides.data[${index}] 缺少 id`);
              continue;
            }
            if (typeof item.version !== 'number' || !Number.isInteger(item.version)) {
              errors.push(`provides.data[${index}] 的 version 必须是整数`);
              continue;
            }
            data.push({
              id: item.id.trim(),
              version: item.version,
              summary: typeof item.summary === 'string' ? item.summary.trim() : '',
            });
          }
          provides.data = data;
        }
      }
    }
  }

  let consumes: PluginManifestShape['consumes'];
  if (input.consumes !== undefined) {
    if (!isRecord(input.consumes)) {
      errors.push('consumes 必须是对象');
    } else if (input.consumes.data !== undefined) {
      if (!Array.isArray(input.consumes.data)) {
        errors.push('consumes.data 必须是数组');
      } else {
        const data: ManifestDataDependency[] = [];
        for (const [index, item] of input.consumes.data.entries()) {
          if (!isRecord(item) || typeof item.id !== 'string' || item.id.trim() === '') {
            errors.push(`consumes.data[${index}] 缺少 id`);
            continue;
          }
          if (typeof item.version !== 'number' || !Number.isInteger(item.version)) {
            errors.push(`consumes.data[${index}] 的 version 必须是整数`);
            continue;
          }
          const dependency: ManifestDataDependency = {
            id: item.id.trim(),
            version: item.version,
          };
          if (item.optional === true) dependency.optional = true;
          data.push(dependency);
        }
        consumes = { data };
      }
    }
  }

  const manifest: PluginManifestShape | null =
    errors.length > 0 || id === null || name === null
      ? null
      : {
          id,
          name,
          version: rawVersion,
          apiVersion: expectedApiVersion,
          permissions,
          ...(description === undefined ? {} : { description }),
          ...(author === undefined ? {} : { author }),
          ...(homepage === undefined ? {} : { homepage }),
          ...(dependencies === undefined ? {} : { dependencies }),
          ...(optionalDependencies === undefined ? {} : { optionalDependencies }),
          ...(provides === undefined ? {} : { provides }),
          ...(consumes === undefined ? {} : { consumes }),
        };

  return { ok: errors.length === 0 && manifest !== null, errors, warnings, manifest };
}

const isValidRange = isValidVersionRange;
