/**
 * 扫描结果的归属：一个格子该交给哪个插件处理。
 *
 * 新清单在 target 里直接带 `owner`；旧纸（P3.5 之前打印）没有这个字段，
 * 只能按 payload 前缀回退。回退表只覆盖 core 内置的三个数据类别，
 * 插件自定义的类别必须在新清单里写 owner——不能靠猜。
 */
export const SCAN_PAYLOAD_OWNERS: Readonly<Record<string, string>> = {
  task: 'gofor.tasks',
  habit: 'gofor.checkin',
  mood: 'gofor.mood',
};

export interface OwnableScanResult {
  owner?: string | null;
  payload?: string | null;
}

/** 有 owner 用 owner；否则按 `payload` 的前缀回退；都不认识返回 null。 */
export function scanResultOwner(result: OwnableScanResult): string | null {
  const owner = result.owner?.trim();
  if (owner) return owner;
  const payload = result.payload ?? '';
  const index = payload.indexOf(':');
  if (index <= 0) return null;
  return SCAN_PAYLOAD_OWNERS[payload.slice(0, index)] ?? null;
}
