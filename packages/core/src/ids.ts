/**
 * 唯一 ID 生成。
 *
 * 领域层禁止自己写 `Math.random()`：原因是离线优先 + 多端同步时，
 * ID 冲突的排查成本极高，统一入口才好替换成可排序 ID。
 */

/** 生成一个全局唯一 ID。优先用 `crypto.randomUUID()`。 */
export function newId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  // 兜底：极老环境。可读性差但唯一性够用。
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
