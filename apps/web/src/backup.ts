/**
 * 备份与持久化存储。
 *
 * 为什么需要这一层：数据只存在浏览器 IndexedDB 里，而浏览器在存储压力下
 * **可以静默清掉**。`navigator.storage.persist()` 是唯一能让浏览器承诺
 * 「不主动清理」的接口；在它之外，唯一的保险就是让用户导出一份 JSON。
 *
 * 这个文件是宿主层（可以碰 localStorage / Blob / DOM），所以不放进
 * `packages/core`。所有 localStorage 访问都包 try/catch：隐私模式、旧 WebView
 * 里它可能直接抛异常，备份提醒绝不能因此把 App 搞崩。
 */
import { DEFAULT_APP_CONFIG } from '@gofor/core/config';
import { exportAll, type GoForDb } from '@gofor/store';
import { appClock } from './clock.ts';

/** 浏览器是否承诺永久保留本地数据。 */
export type PersistentStorageState = 'granted' | 'denied' | 'unsupported';

/** 上次成功备份的时间戳（epoch 毫秒）。 */
const LAST_BACKUP_KEY = 'gofor.backup.lastAt';
/** 用户点「今天不再提醒」的本地日期（`YYYY-MM-DD`）。 */
const DISMISSED_ON_KEY = 'gofor.backup.dismissedOn';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localStorageSafe(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 某些沙箱/隐私模式下，连读取 localStorage 这个属性都会抛 SecurityError。
    return null;
  }
}

/** 本地日期键 `YYYY-MM-DD`。只用于「今天」的判定与备份文件名。 */
function localDateKey(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 申请持久化存储。
 *
 * - 已经持久化 → `'granted'`，不重复申请
 * - 浏览器不支持（旧 WebView / 非安全上下文）→ `'unsupported'`
 * - 用户/浏览器拒绝 → `'denied'`
 *
 * **任何异常都不向外抛**：隐私模式与旧内核里 `persist()` 可能抛 SecurityError，
 * 这只能让「承诺保留」不可用，不能让应用启动失败。
 */
export async function requestPersistentStorage(): Promise<PersistentStorageState> {
  try {
    const storage = globalThis.navigator?.storage;
    if (
      !storage ||
      typeof storage.persisted !== 'function' ||
      typeof storage.persist !== 'function'
    ) {
      return 'unsupported';
    }
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * 只读查询持久化状态，供 UI 展示「数据是否已被浏览器承诺保留」。
 * 不会申请权限，也不会抛异常。
 */
export async function storageStatus(): Promise<PersistentStorageState> {
  try {
    const storage = globalThis.navigator?.storage;
    if (!storage || typeof storage.persisted !== 'function') return 'unsupported';
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** 上次成功备份时间；从未备份或读不到 localStorage 时返回 null。 */
export function lastBackupAt(): number | null {
  const storage = localStorageSafe();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_BACKUP_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** 记录一次成功备份。 */
export function markBackedUp(now: number): void {
  const storage = localStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(LAST_BACKUP_KEY, String(now));
  } catch {
    // 写不进去只意味着提醒会再次出现；备份文件本身已经下载成功了。
  }
}

/**
 * 现在是否该提醒备份。
 *
 * 从未备份过 → 立刻提醒；否则距上次备份 ≥ 配置的提醒间隔（天）。
 * `reminderDays` 默认取自配置默认值，正常路径由调用方传入实际配置。
 */
export function needsBackup(
  now: number,
  reminderDays: number = DEFAULT_APP_CONFIG.backup.reminderDays,
): boolean {
  const last = lastBackupAt();
  if (last === null) return true;
  const days =
    Number.isFinite(reminderDays) && reminderDays > 0
      ? reminderDays
      : DEFAULT_APP_CONFIG.backup.reminderDays;
  return now - last >= days * MS_PER_DAY;
}

/** 今天是否已点过「今天不再提醒」。 */
export function isBackupDismissedToday(now: number): boolean {
  const storage = localStorageSafe();
  if (!storage) return false;
  try {
    return storage.getItem(DISMISSED_ON_KEY) === localDateKey(now);
  } catch {
    return false;
  }
}

/** 点「今天不再提醒」：只压住今天，明天照常提醒。 */
export function dismissBackupToday(now: number): void {
  const storage = localStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(DISMISSED_ON_KEY, localDateKey(now));
  } catch {
    // 同上：压不住提醒不影响应用运行。
  }
}

/** 一次备份写出的数据量，供 UI 给用户反馈。 */
export interface BackupCounts {
  tasks: number;
  sessions: number;
  subjects: number;
  templates: number;
}

/**
 * 导出全部数据并触发浏览器下载。
 *
 * 文件名固定为 `gofor-backup-YYYY-MM-DD.json`，方便用户在一堆下载里认出来。
 * 只有下载动作成功返回后才写 `lastBackupAt`——把「点了按钮」当成「备份成功」
 * 会让提醒系统撒谎。
 */
export async function downloadBackup(database: GoForDb): Promise<BackupCounts> {
  const now = appClock.now();
  const bundle = await exportAll(database);

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gofor-backup-${localDateKey(now)}.json`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 不能立刻 revoke：Chromium 在 click 之后才真正读取 Blob，
  // 同步回收偶尔会得到 0 字节文件。推迟到下载已开始之后。
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);

  markBackedUp(now);

  return {
    tasks: bundle.tasks?.length ?? 0,
    sessions: bundle.sessions?.length ?? 0,
    subjects: bundle.subjects?.length ?? 0,
    templates: bundle.templates?.length ?? 0,
  };
}
