import type { DataAvailability } from '@gofor/plugin-api';

/**
 * 数据能力契约的解析规则（纯逻辑）。
 *
 * 顺序是硬约定：**core 内置 > 已启用插件 > 没有**。
 * 不允许插件覆盖 core 的同名契约（否则"学习时长"可能被任一插件改口径），
 * 也不允许同一个 id 出现两个插件 provider 时后注册的静默赢——宿主只取第一个，
 * 并把冲突报给安装页。
 */

export interface DataContractEntry {
  id: string;
  version: number;
  /** 提供方：`core` 或插件 id。 */
  providerId: string;
  source: 'core' | 'plugin';
  query(input: unknown): Promise<unknown>;
  revision(): Promise<number>;
}

export interface DataResolution {
  entry: DataContractEntry | null;
  availability: DataAvailability;
}

/** 在候选里按规则挑一个 provider；版本必须严格相等。 */
export function resolveDataContract(
  entries: readonly DataContractEntry[],
  id: string,
  version: number,
): DataResolution {
  const matching = entries.filter((entry) => entry.id === id);
  if (matching.length === 0) {
    return { entry: null, availability: { status: 'missing', reason: 'not-installed' } };
  }

  const core = matching.find((entry) => entry.source === 'core');
  if (core) {
    if (core.version !== version) {
      return { entry: null, availability: { status: 'missing', reason: 'version-mismatch' } };
    }
    return {
      entry: core,
      availability: { status: 'available', providerId: core.providerId, version: core.version },
    };
  }

  const plugin = matching.find((entry) => entry.version === version);
  if (!plugin) {
    return { entry: null, availability: { status: 'missing', reason: 'version-mismatch' } };
  }
  return {
    entry: plugin,
    availability: { status: 'available', providerId: plugin.providerId, version: plugin.version },
  };
}

export interface DataDependencyShape {
  id: string;
  version: number;
  optional?: boolean;
}

export interface DataDependencyStatus extends DataDependencyShape {
  availability: DataAvailability;
}

/**
 * 把一个插件的 `consumes.data` 翻译成「可用/未安装」。
 *
 * 界面必须据此显示「未安装」，**不能**把缺失当成 0（周报 0 分钟那种静默错数据）。
 */
export function describeDataDependencies(
  dependencies: readonly DataDependencyShape[],
  entries: readonly DataContractEntry[],
): DataDependencyStatus[] {
  return dependencies.map((dependency) => ({
    ...dependency,
    availability: resolveDataContract(entries, dependency.id, dependency.version).availability,
  }));
}

/** 找同一个 id 的重复插件 provider（安装页要提示"后装的不生效"）。 */
export function findDataProviderConflicts(entries: readonly DataContractEntry[]): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const entry of entries) {
    if (entry.source === 'core') continue;
    const previous = seen.get(entry.id);
    if (previous !== undefined && previous !== entry.providerId) {
      conflicts.push(`${entry.id} 同时由 ${previous} 与 ${entry.providerId} 提供，只使用前者`);
    } else if (previous === undefined) {
      seen.set(entry.id, entry.providerId);
    }
  }
  return conflicts;
}
