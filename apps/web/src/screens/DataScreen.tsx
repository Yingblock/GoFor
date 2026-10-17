import { db, importAll } from '@gofor/store';
import { useEffect, useRef, useState } from 'react';
import {
  type BackupCounts,
  downloadBackup,
  lastBackupAt,
  needsBackup,
  type PersistentStorageState,
  storageStatus,
} from '../backup.ts';
import { appClock } from '../clock.ts';

export interface DataScreenProps {
  /** 导入/导出结果统一走外壳的提示条，避免每个页面自己造一个。 */
  onNotice: (text: string) => void;
}

function formatWhen(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const STORAGE_TEXT: Record<PersistentStorageState, string> = {
  granted: '浏览器已承诺保留这份数据（不会被"存储紧张"清理）',
  denied: '浏览器还没有承诺保留：清理缓存/站点数据会丢，务必定期导出',
  unsupported: '这个环境不支持申请"持久化保留"：请定期导出备份',
};

/**
 * 数据与备份（离线·M3）。
 *
 * 为什么单独做一屏：备份/导入以前只藏在命令面板（⌘K）里，用户根本找不到。
 * 数据丢过一次之后，"在哪看、怎么导出、怎么恢复"必须是一眼能看到的界面，
 * 而不是记一个快捷键。
 *
 * 另外把两件事解释清楚：
 * 1. 改动是**即时写库**的，关窗口不会丢——以前 Windows 壳每次换端口导致"换了数据库"，
 *    是壳的 bug，不是没保存；
 * 2. 真正会丢的是"清站点数据 / 换设备 / 浏览器驱逐"，所以导出的 JSON 才是保险。
 */
export function DataScreen({ onNotice }: DataScreenProps) {
  const [lastAt, setLastAt] = useState<number | null>(() => lastBackupAt());
  const [storage, setStorage] = useState<PersistentStorageState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void storageStatus().then((state) => {
      if (alive) setStorage(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  const exportNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const counts: BackupCounts = await downloadBackup(db);
      setLastAt(appClock.now());
      onNotice(
        `已导出备份：${counts.tasks} 个任务、${counts.sessions} 条学习记录、${counts.subjects} 个科目`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const result = await importAll(db, JSON.parse(text));
      onNotice(
        `已导入 ${result.imported.tasks} 个任务、${result.imported.sessions} 条学习记录、` +
          `${result.imported.habits} 项打卡、${result.imported.checklists} 个清单`,
      );
    } catch (cause) {
      setError(`导入失败：${cause instanceof Error ? cause.message : '文件不是 GoFor 备份'}`);
    } finally {
      setBusy(false);
    }
  };

  const overdue = needsBackup(appClock.now());

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-50">数据在哪</h2>
        <div className="space-y-2 rounded-xl border border-black/[0.08] bg-white/50 px-4 py-3 text-xs leading-relaxed">
          <p>
            全部数据都存在这台设备本地（浏览器的 IndexedDB），不联网、不上传。
            每次改动都是即时写入的，关掉窗口或刷新都不会丢。
          </p>
          <p className="opacity-60">
            {storage === null ? '正在检查是否已被承诺保留…' : STORAGE_TEXT[storage]}
          </p>
          <p className="opacity-60">
            真正会丢的情况只有三种：清站点数据/清缓存、换设备、系统重装。
            所以下面的「导出备份」才是保险——导出的 JSON 也可以直接导回来。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium opacity-50">备份与恢复</h2>
          <span className={`text-[11px] ${overdue ? 'text-amber-600' : 'opacity-40'}`}>
            {lastAt === null ? '还没有备份记录' : `上次备份：${formatWhen(lastAt)}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void exportNow()}
            disabled={busy}
            className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white disabled:opacity-50"
          >
            {busy ? '处理中…' : '导出备份（JSON）'}
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-black/10 bg-white/70 px-4 py-2 text-xs disabled:opacity-50"
          >
            从备份导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="选择备份文件"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
          />
        </div>

        <p className="text-[11px] leading-relaxed opacity-40">
          导入是合并而不是覆盖：同 id 更新、新 id 追加，所以拿一份旧备份导进来不会把
          现在更新的记录删掉。导入的是全部表：作业、学习记录、打卡、课表、标签、模板、
          清单、三格自评、日记、工具箱记录与扫描批次。
        </p>

        {error ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium opacity-50">注意</h2>
        <ul className="space-y-1 text-[11px] leading-relaxed opacity-50">
          <li>
            · Windows 版是本地壳：数据绑定在固定地址（`127.0.0.1:47821`）下，同一时间只开一个窗口。
          </li>
          <li>
            · 0.2.5 及更早的 Windows 包每次启动端口随机，旧数据留在了那些随机地址下，
            升级后看不到也无法自动迁回；如果之前用「导出备份」存过 JSON，在新版里导入即可。
          </li>
          <li>· 手机浏览器/PWA 与 Windows 壳是两套独立数据，互不同步（同步属于 P7 云存档）。</li>
          <li>· 备份文件是明文 JSON，自己存网盘时注意这一点。</li>
        </ul>
      </section>
    </div>
  );
}
