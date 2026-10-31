/**
 * 扫描结果的归属：一个格子该交给哪个插件处理。
 *
 * 新清单在 target 里直接带 `owner`；旧纸没有这个字段时，只能按 payload 前缀，
 * 用宿主从启用插件 manifest 的 `provides.scanPayloads` 汇总出的表回退。
 * core 不再写死 task/habit/mood 归属；没有声明就是 null（missing），不能猜。
 */
export type ScanPayloadOwners = Readonly<Record<string, string>>;

export interface OwnableScanResult {
  owner?: string | null;
  payload?: string | null;
}

/** 有 owner 用 owner；否则用宿主从插件 manifest 汇总的前缀表回退。 */
export function scanResultOwner(
  result: OwnableScanResult,
  payloadOwners: ScanPayloadOwners = {},
): string | null {
  const owner = result.owner?.trim();
  if (owner) return owner;
  const payload = result.payload ?? '';
  const index = payload.indexOf(':');
  if (index <= 0) return null;
  return payloadOwners[payload.slice(0, index)] ?? null;
}
