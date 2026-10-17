/**
 * 备份提醒横幅。
 *
 * 只在「需要备份」时出现：从未备份过，或距上次备份超过配置的提醒间隔。
 * 数据只存在这台设备的 IndexedDB 里，所以这里必须把话说明白，但不能吓人：
 * 讲清风险 + 给一个一键动作（导出 JSON），而不是弹窗教育。
 */
import { db, importAll } from '@gofor/store';
import { useEffect, useRef, useState } from 'react';
import {
  type BackupCounts,
  dismissBackupToday,
  downloadBackup,
  isBackupDismissedToday,
  lastBackupAt,
  needsBackup,
  type PersistentStorageState,
  storageStatus,
} from '../backup.ts';
import { appClock } from '../clock.ts';

/** 成功提示停留时长：够看清，又不长期占着版面。 */
const SUCCESS_VISIBLE_MS = 3000;

export interface BackupBannerProps {
  /** 配置里的提醒间隔（天）。现实世界会变，所以不写死在这里。 */
  reminderDays: number;
}

/** `YYYY-MM-DD HH:mm`，本地时区。 */
function formatWhen(epochMs: number): string {
  const date = new Date(epochMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

function formatCounts(counts: BackupCounts): string {
  return `已备份 ${counts.tasks} 个任务、${counts.sessions} 条学习记录`;
}

export function BackupBanner({ reminderDays }: BackupBannerProps) {
  const [lastAt, setLastAt] = useState<number | null>(() => lastBackupAt());
  const [dismissed, setDismissed] = useState(() => isBackupDismissedToday(appClock.now()));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<PersistentStorageState | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void storageStatus().then((state) => {
      if (alive) setStorage(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 成功提示自动收起。备份已经完成，提醒没有继续存在的理由。
  useEffect(() => {
    if (result === null) return;
    const timer = globalThis.setTimeout(() => setResult(null), SUCCESS_VISIBLE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [result]);

  const now = appClock.now();
  const needed = !dismissed && needsBackup(now, reminderDays);

  if (result !== null) {
    return (
      <div
        data-testid="backup-banner"
        className="mx-4 mt-3 rounded-xl border border-emerald-600/20 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900/80 md:mx-8"
      >
        ✓ {result}，文件已下载。
      </div>
    );
  }

  if (!needed) return null;

  const backup = async () => {
    setBusy(true);
    setError(null);
    try {
      const counts = await downloadBackup(db);
      setLastAt(appClock.now());
      setResult(formatCounts(counts));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '未知错误');
    } finally {
      setBusy(false);
    }
  };

  /** 从备份恢复：放在这里是因为"没备份过"的人最需要先导入一份旧的。 */
  const importBackup = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const result = await importAll(db, JSON.parse(await file.text()));
      setResult(`已导入 ${result.imported.tasks} 个任务、${result.imported.sessions} 条学习记录`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件不是 GoFor 备份');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    dismissBackupToday(now);
    setDismissed(true);
  };

  return (
    <div
      data-testid="backup-banner"
      className="mx-4 mt-3 rounded-xl border border-black/[0.08] bg-white/60 px-4 py-3 md:mx-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">数据只在这台设备上</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-60">
            {lastAt === null ? '还没有备份记录。' : `上次备份：${formatWhen(lastAt)}。`}
            浏览器在存储紧张时可能清掉本地数据，导出一份 JSON 最稳。
          </p>
          {storage !== null && storage !== 'granted' ? (
            <p className="mt-1 text-[11px] opacity-40">浏览器还没有承诺永久保留这些数据。</p>
          ) : null}
          {error ? <p className="mt-1 text-[11px] text-red-700/70">备份失败：{error}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void backup()}
            disabled={busy}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            {busy ? '正在备份…' : '立即备份'}
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            从备份导入
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            aria-label="选择备份文件"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2 py-1.5 text-xs opacity-50 transition hover:opacity-80"
          >
            今天不再提醒
          </button>
        </div>
      </div>
    </div>
  );
}
