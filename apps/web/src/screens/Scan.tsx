import { newId } from '@gofor/core';
import { dateKey, type ScanBatch, type ScanResult } from '@gofor/core/domain';
import { classifyInk, type InkReading, type SheetManifest } from '@gofor/core/scan';
import {
  db,
  getSheetManifest,
  listScanBatches,
  saveScanBatch,
  updateScanBatchStatus,
} from '@gofor/store';
import { binarize, detectPageQuad, type Quad, toGray } from '@gofor/vision';
import { useCallback, useEffect, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';

import { CameraCapture } from './scan/CameraCapture.tsx';
import { CornerPicker } from './scan/CornerPicker.tsx';
import { type LoadedPhoto, loadPhotoFile } from './scan/capture.ts';
import { readSheet, sampleTargets } from './scan/pipeline.ts';
import { ScanReview } from './scan/ScanReview.tsx';

type Stage = 'pick' | 'corner' | 'review';

/**
 * 扫描回填（P2-2.2 / 2.4 / 2.5）。
 *
 * 流程刻意做成"每步都能退回去"：
 *   选照片 → 手动点四角 → 识别 → 待确认列表 → 应用/丢弃
 * 任何一步失败都停在原地给原因，不自动跳到下一步，也不自动写数据。
 */
export function ScanScreen() {
  const [stage, setStage] = useState<Stage>('pick');
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [initialQuad, setInitialQuad] = useState<Quad | undefined>(undefined);
  const [batch, setBatch] = useState<ScanBatch | null>(null);
  const [recent, setRecent] = useState<ScanBatch[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRecent = useCallback(async () => {
    setRecent(await listScanBatches(db, 8));
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  /** 拿到照片后的公共入口：选文件和相机拍都走这一条，后面流程完全一致。 */
  const enterCorner = (loaded: LoadedPhoto) => {
    // 自动找纸只用来给一个初始猜测；找错了用户拖一下就行，找不到就内缩矩形。
    const guess = detectPageQuad(binarize(toGray(loaded.image)), loaded.width, loaded.height);
    setPhoto(loaded);
    setInitialQuad(guess ?? undefined);
    setStage('corner');
  };

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      enterCorner(await loadPhotoFile(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '这张照片打不开');
    } finally {
      setBusy(false);
    }
  };

  const onCaptured = (loaded: LoadedPhoto) => {
    setError(null);
    // enterCorner 在前：万一自动找纸抛错，覆盖层还开着，CameraCapture 能把原因显示出来。
    enterCorner(loaded);
    setCameraOpen(false);
  };

  const onQuad = async (quad: Quad) => {
    if (photo === null) return;
    setBusy(true);
    setError(null);
    try {
      const sheet = readSheet(photo.image, quad, '');
      if (!sheet.ok) {
        setError(sheet.reason);
        return;
      }
      const { link, page, binary } = sheet;
      const record = await getSheetManifest(db, link.templateId, link.date, link.paper);
      if (record === undefined) {
        setError(
          `这张纸没有坐标记录（模板 ${link.templateId}、${link.date}、${link.paper}）。` +
            '多半是旧版本打印的：用当前版本重新打印一次，再扫就有坐标了。',
        );
        return;
      }

      const manifest = JSON.parse(record.json) as SheetManifest;
      const targets = manifest.pages.flatMap((item) => item.targets);
      const readings: InkReading[] = sampleTargets(binary, page, targets);
      const results: ScanResult[] = classifyInk(manifest, readings);

      const next: ScanBatch = {
        id: newId(),
        createdAt: appClock.now(),
        date: link.date,
        templateId: link.templateId,
        paper: link.paper,
        results,
        status: 'pending',
        appliedAt: null,
      };
      await saveScanBatch(db, next);
      setBatch(next);
      await refreshRecent();
      setStage('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '识别失败');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStage('pick');
    setPhoto(null);
    setInitialQuad(undefined);
    setBatch(null);
    setCameraOpen(false);
    setError(null);
  };

  const resume = async (item: ScanBatch) => {
    setBatch(item);
    setStage('review');
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-50">拍一张纸</h2>
        <p className="text-[11px] leading-relaxed opacity-40">
          纸上的二维码里写着模板与日期，所以同一张纸扫两次也能对上同一天。
          识别只是猜测，进「待确认」后由你决定写不写。
        </p>

        {stage === 'pick' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCameraOpen(true);
              }}
              className="rounded-lg bg-[var(--color-ink)] px-4 py-2 text-xs text-white"
            >
              用相机拍
            </button>
            <label className="cursor-pointer rounded-lg border border-black/10 bg-white/60 px-4 py-2 text-xs">
              选一张照片
              <input
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="选择纸的照片"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                  event.target.value = '';
                }}
              />
            </label>
            <span className="text-[11px] opacity-35">
              也可以直接把照片拖进这个页面（拖拽在桌面端更快）
            </span>
          </div>
        ) : null}

        {busy ? <p className="text-xs opacity-50">正在处理照片…</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {photo !== null && stage === 'corner' ? (
        <section className="space-y-3">
          <CornerPicker
            imageUrl={photo.url}
            naturalWidth={photo.width}
            naturalHeight={photo.height}
            {...(initialQuad === undefined ? {} : { initialQuad })}
            onConfirm={(quad) => void onQuad(quad)}
            onCancel={reset}
          />
        </section>
      ) : null}

      {batch !== null && stage === 'review' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium opacity-50">待确认</h2>
            <span className="text-[11px] opacity-35">
              {batch.templateId} · {batch.paper}
            </span>
            <button
              type="button"
              onClick={reset}
              className="ml-auto rounded-lg border border-black/10 px-3 py-1.5 text-xs"
            >
              扫下一张
            </button>
          </div>
          <ScanReview
            batch={batch}
            onSettled={() => {
              void refreshRecent();
            }}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium opacity-50">最近的扫描</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/[0.12] px-4 py-6 text-center text-xs opacity-40">
            还没有扫描记录
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
            {recent.map((item) => {
              const selected = item.results.filter((result) => result.selected).length;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
                  <span className="tabular-nums opacity-45">{item.date}</span>
                  <span className="opacity-50">{item.templateId}</span>
                  <span className="opacity-35">
                    {item.paper} · {selected} 项已识别
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        item.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : item.status === 'applied'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-black/[0.06] opacity-60'
                      }`}
                    >
                      {item.status === 'pending'
                        ? '待确认'
                        : item.status === 'applied'
                          ? '已回填'
                          : '已丢弃'}
                    </span>
                    {item.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void resume(item)}
                        className="text-[11px] opacity-50 hover:opacity-80"
                      >
                        继续确认
                      </button>
                    ) : null}
                    {item.status === 'discarded' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updateScanBatchStatus(db, item.id, 'pending', appClock.now())
                        }
                        className="text-[11px] opacity-40 hover:opacity-70"
                      >
                        重新打开
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] opacity-35">
          今天：{dateKey(appClock)}。回填只写这张纸上的日期，不改其它天。
        </p>
      </section>

      {cameraOpen ? (
        <CameraCapture onCaptured={onCaptured} onCancel={() => setCameraOpen(false)} />
      ) : null}
    </div>
  );
}
