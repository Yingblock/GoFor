import { isValidVersionRange, parseVersion, satisfiesVersion } from './version.ts';

/**
 * 插件依赖解析（纯逻辑，可在 Node 里单测）。
 *
 * 只回答一个问题：**按什么顺序启用哪些插件、哪些启用不了、为什么**。
 * 不碰 React、不碰数据库；宿主拿到结果后照着激活即可。
 *
 * 规则（与 ROADMAP P3-3.2 / P3-3.9 一致）：
 * - 硬依赖缺失 / 被禁用 / 版本不满足 → 本插件不启用，并给出**可读原因**；
 * - 依赖被禁用时，依赖它的插件也不能启用（不能"跳过依赖自己跑"，会静默读空）；
 * - 可选依赖只影响顺序，缺失不算错；
 * - 依赖成环时环上及依赖环的插件都不启用（宁可少启一个，不能死循环）。
 */

export interface PluginDescriptor {
  id: string;
  version: string;
  enabled: boolean;
  /** 插件 id → 版本范围。 */
  dependencies?: Record<string, string>;
  optionalDependencies?: string[];
}

export type PluginProblemKind =
  | 'duplicate-id'
  | 'missing-dependency'
  | 'disabled-dependency'
  | 'version-mismatch'
  | 'dependency-cycle'
  | 'invalid-version';

export interface PluginProblem {
  pluginId: string;
  kind: PluginProblemKind;
  dependencyId?: string;
  message: string;
}

export interface ResolvePluginResult {
  /** 可以激活的插件 id，硬依赖与可选依赖都在它前面。 */
  order: string[];
  /** 用户启用了但实际启用不了的插件。 */
  blocked: string[];
  problems: PluginProblem[];
}

export function resolvePluginOrder(descriptors: readonly PluginDescriptor[]): ResolvePluginResult {
  const problems: PluginProblem[] = [];
  const byId = new Map<string, PluginDescriptor>();

  for (const descriptor of descriptors) {
    if (byId.has(descriptor.id)) {
      problems.push({
        pluginId: descriptor.id,
        kind: 'duplicate-id',
        message: `插件 id ${descriptor.id} 重复，后一个被忽略`,
      });
      continue;
    }
    byId.set(descriptor.id, descriptor);
  }

  const candidates = new Set<string>();
  for (const [id, descriptor] of byId) {
    if (!descriptor.enabled) continue;
    if (parseVersion(descriptor.version) === null) {
      problems.push({
        pluginId: id,
        kind: 'invalid-version',
        message: `插件版本 ${descriptor.version} 不是合法的 x.y.z`,
      });
      continue;
    }
    candidates.add(id);
  }

  const blocked = new Map<string, PluginProblem>();

  // 固定点迭代：依赖被禁用/被阻塞的插件也要跟着阻塞（传递闭包）。
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of candidates) {
      if (blocked.has(id)) continue;
      const descriptor = byId.get(id);
      if (!descriptor) continue;
      const dependencies = Object.entries(descriptor.dependencies ?? {});
      for (const [dependencyId, range] of dependencies) {
        if (!isValidVersionRange(range)) {
          blocked.set(id, {
            pluginId: id,
            kind: 'version-mismatch',
            dependencyId,
            message: `依赖 ${dependencyId} 的版本范围不合法：${range}`,
          });
          changed = true;
          break;
        }
        const dependency = byId.get(dependencyId);
        if (!dependency) {
          blocked.set(id, {
            pluginId: id,
            kind: 'missing-dependency',
            dependencyId,
            message: `缺少依赖 ${dependencyId}`,
          });
          changed = true;
          break;
        }
        if (!dependency.enabled) {
          blocked.set(id, {
            pluginId: id,
            kind: 'disabled-dependency',
            dependencyId,
            message: `依赖 ${dependencyId} 已被禁用`,
          });
          changed = true;
          break;
        }
        if (blocked.has(dependencyId)) {
          blocked.set(id, {
            pluginId: id,
            kind: 'disabled-dependency',
            dependencyId,
            message: `依赖 ${dependencyId} 启用失败`,
          });
          changed = true;
          break;
        }
        if (!satisfiesVersion(dependency.version, range)) {
          blocked.set(id, {
            pluginId: id,
            kind: 'version-mismatch',
            dependencyId,
            message: `依赖 ${dependencyId}@${dependency.version} 不满足 ${range}`,
          });
          changed = true;
          break;
        }
      }
    }
  }

  const active = new Set([...candidates].filter((id) => !blocked.has(id)));

  /** 边：dep -> plugin（含可选依赖），只保留都处于 active 的。 */
  const dependents = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of active) indegree.set(id, 0);
  for (const id of active) {
    const descriptor = byId.get(id);
    if (!descriptor) continue;
    const dependencies = new Set([
      ...Object.keys(descriptor.dependencies ?? {}),
      ...(descriptor.optionalDependencies ?? []),
    ]);
    for (const dependencyId of dependencies) {
      if (!active.has(dependencyId)) continue;
      if (dependencyId === id) {
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
        continue;
      }
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      const list = dependents.get(dependencyId) ?? [];
      list.push(id);
      dependents.set(dependencyId, list);
    }
  }

  // Kahn：入度为 0 的先启用，顺序按 id 排，保证同一份输入永远得到同一份输出。
  const queue = [...active].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        queue.push(dependent);
        queue.sort();
      }
    }
  }

  for (const id of active) {
    if (order.includes(id)) continue;
    blocked.set(id, {
      pluginId: id,
      kind: 'dependency-cycle',
      message: '依赖成环，无法确定启用顺序',
    });
  }

  return {
    order,
    blocked: [...blocked.keys()].sort(),
    problems: [...problems, ...blocked.values()],
  };
}
