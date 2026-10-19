import { newId } from '@gofor/core';
import {
  dateKey,
  type ScanBatch,
  type ScanResult,
  type SheetManifestRecord,
} from '@gofor/core/domain';
import { materialize, PAPER_IDS, type PaperId } from '@gofor/core/print';
import {
  buildSheetManifest,
  classifyInk,
  type InkReading,
  type SheetManifest,
  sheetCodeToken,
} from '@gofor/core/scan';
import {
  db,
  getSheetManifest,
  listScanBatches,
  listTasks,
  listTemplates,
  saveScanBatch,
  saveSheetManifest,
  sheetManifestId,
  updateScanBatchStatus,
} from '@gofor/store';
import { Badge, Button, Card, EmptyState, Section } from '@gofor/ui';
import { binarize, detectPageQuad, type ImageDataLike, type Quad, toGray } from '@gofor/vision';
import { useCallback, useEffect, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import { todayLabel } from '../format.ts';
import {
  isBuiltinTemplateId,
  PRINT_TEMPLATE_CONSTANTS,
  parseStoredTemplate,
  resolvePrintTemplate,
} from '../print/template.ts';

import { CameraCapture } from './scan/CameraCapture.tsx';
import { CornerPicker } from './scan/CornerPicker.tsx';
import { type LoadedPhoto, loadPhotoFile } from './scan/capture.ts';
import { readSheet, sampleTargets } from './scan/pipeline.ts';
import { ScanReview } from './scan/ScanReview.tsx';

type Stage = 'pick' | 'corner' | 'rebuild' | 'review';

/**
 * 「这张纸没有坐标记录」时保留的上下文。
 *
 * 重建坐标需要照片本身（重新采样）和纸的身份（模板/日期/纸张/页），
 * 所以整份存下来，而不是只留一句错误文案——错误文案没法继续。
 */
interface MissingManifest {
  templateId: string;
  date: string;
  paper: string;
  /** 0 起的页号。 */
  pageIndex: number;
  /** 身份来自二维码还是条码（待确认页会写明）。 */
  source: 'qr' | 'barcode';
  page: ImageDataLike;
  binary: Uint8Array;
}

/**
 * 扫描回填（P2-2.2 / 2.3 / 2.4 / 2.5）。
 *
 * 流程刻意做成"每步都能退回去"：
 *   选照片 → 手动点四角 → 识别 → 待确认列表 → 应用/丢弃
 * 任何一步失败都停在原地给原因，不自动跳到下一步，也不自动写数据。
 */
export function ScanScreen({ onOpenPrint }: { onOpenPrint?: () => void }) {
  const [stage, setStage] = useState<Stage>('pick');
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [initialQuad, setInitialQuad] = useState<Quad | undefined>(undefined);
  const [batch, setBatch] = useState<ScanBatch | null>(null);
  const [recent, setRecent] = useState<ScanBatch[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingManifest | null>(null);

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
    setMissing(null);
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

  /**
   * 采样并进入待确认。
   *
   * 只取**这一页**的 target：以前把所有页的 target 都摊到一张照片上采样，
   * 第 2 页起的坐标会落到第 1 页的纸上，结果必然全错（而且不报错）。
   */
  const finishScan = async (input: {
    manifest: SheetManifest;
    manifestSource: 'stored' | 'rebuilt';
    source: 'qr' | 'barcode';
    templateId: string;
    date: string;
    paper: string;
    pageIndex: number;
    page: ImageDataLike;
    binary: Uint8Array;
  }) => {
    const pageManifest = input.manifest.pages.find((page) => page.index === input.pageIndex);
    if (pageManifest === undefined) {
      setError(`这张纸的第 ${input.pageIndex + 1} 页没有坐标记录，没法回填。重新打印一次再扫。`);
      return;
    }

    const scoped: SheetManifest = { ...input.manifest, pages: [pageManifest] };
    const readings: InkReading[] = sampleTargets(input.binary, input.page, pageManifest.targets);
    const results: ScanResult[] = classifyInk(scoped, readings);

    const next: ScanBatch = {
      id: newId(),
      createdAt: appClock.now(),
      date: input.date,
      templateId: input.templateId,
      paper: input.paper,
      results,
      status: 'pending',
      appliedAt: null,
      source: input.source,
      manifestSource: input.manifestSource,
    };
    await saveScanBatch(db, next);
    setBatch(next);
    setMissing(null);
    await refreshRecent();
    setStage('review');
  };

  const onQuad = async (quad: Quad) => {
    if (photo === null) return;
    setBusy(true);
    setError(null);
    setMissing(null);
    try {
      const sheet = readSheet(photo.image, quad, '');
      if (!sheet.ok) {
        setError(sheet.reason);
        return;
      }

      const { page, binary, pageIndex } = sheet;
      let templateId: string;
      let date: string;
      let paper: string;
      let record: SheetManifestRecord | undefined;

      if (sheet.source === 'barcode') {
        date = sheet.code.date;
        paper = sheet.code.paper;
        // 条码只带模板短码：在当天、同纸张的清单里按短码反查。
        // 不按「模板 + 日期 + 纸张」直接取，是因为短码本来就是为了不让纸上写全 id。
        const sameDay = await db.sheetManifests.where('date').equals(date).toArray();
        const hits = sameDay.filter(
          (item) => item.paper === paper && sheetCodeToken(item.templateId) === sheet.code.token,
        );
        if (hits.length > 1) {
          setError('这张纸的条码对上了多条坐标记录，没法确定是哪一张。重新打印一次再扫。');
          return;
        }
        record = hits[0];
        if (record !== undefined) {
          templateId = record.templateId;
        } else {
          // 清单丢了但模板还在（换了设备、清了库）：短码能反查出模板，后面可以重建。
          templateId = (await findTemplateIdByToken(sheet.code.token)) ?? '';
          if (templateId === '') {
            setError(
              '条码读出来了，但本机既没有这张纸的坐标记录，也找不到对应模板。' +
                '可能是在另一台设备打印的，或者模板已删除。重新打印一次再扫。',
            );
            return;
          }
        }
      } else {
        templateId = sheet.link.templateId;
        date = sheet.link.date;
        paper = sheet.link.paper;
        record = await getSheetManifest(db, templateId, date, paper);
      }

      if (record === undefined) {
        // 关键：**不静默用当前数据重建**。旧纸上没有清单，重建的行数可能与纸上不同，
        // 直接把勾选记到别人头上是静默错数据；必须让用户明确点一次。
        setMissing({
          templateId,
          date,
          paper,
          pageIndex,
          source: sheet.source,
          page,
          binary,
        });
        setStage('rebuild');
        return;
      }

      const manifest = JSON.parse(record.json) as SheetManifest;
      await finishScan({
        manifest,
        manifestSource: 'stored',
        source: sheet.source,
        templateId,
        date,
        paper,
        pageIndex,
        page,
        binary,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '识别失败');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 按当前模板重建坐标清单，然后立刻继续扫描。
   *
   * 只允许用户显式触发（按钮），不自动：重建用的是**现在的**作业列表，
   * 如果纸上的行数/顺序变过，第 N 行就会指到别人头上。
   */
  const rebuildAndContinue = async () => {
    if (missing === null) return;
    setBusy(true);
    setError(null);
    try {
      if (!PAPER_IDS.includes(missing.paper as PaperId)) {
        setError(`这张纸的纸张「${missing.paper}」不认识，没法重建坐标。`);
        return;
      }

      const customs = await listTemplates(db);
      if (!isBuiltinTemplateId(missing.templateId)) {
        const stored = customs.find((template) => template.id === missing.templateId);
        if (stored === undefined || parseStoredTemplate(stored.json) === null) {
          setError('找不到这张纸用的模板（可能已经删了），没法重建坐标。重新打印一次再扫。');
          return;
        }
      }

      const paper = missing.paper as PaperId;
      const template = resolvePrintTemplate(missing.templateId, paper, customs);
      const tasks = await listTasks(db);
      const blocks = materialize(template, {
        date: missing.date,
        dateLabel: todayLabel(missing.date),
      });
      const manifest = buildSheetManifest({
        templateId: template.id,
        date: missing.date,
        paper,
        blocks,
        bindings: { 'tasks.today': tasks.map((task) => task.id) },
        labels: { 'tasks.today': tasks.map((task) => task.title) },
      });

      // 存下来：下次扫同一张纸就不用再重建，也留下"这份坐标是什么时候算的"。
      await saveSheetManifest(db, {
        id: sheetManifestId(template.id, missing.date, paper),
        templateId: template.id,
        date: missing.date,
        paper,
        json: JSON.stringify(manifest),
        createdAt: appClock.now(),
      });

      await finishScan({
        manifest,
        manifestSource: 'rebuilt',
        source: missing.source,
        templateId: template.id,
        date: missing.date,
        paper,
        pageIndex: missing.pageIndex,
        page: missing.page,
        binary: missing.binary,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重建坐标失败');
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
    setMissing(null);
  };

  const resume = async (item: ScanBatch) => {
    setBatch(item);
    setStage('review');
  };

  return (
    <div className="space-y-8">
      <Section title="拍一张纸">
        <div className="space-y-3">
          <p className="text-caption leading-relaxed opacity-40">
            纸上的二维码里写着模板与日期，所以同一张纸扫两次也能对上同一天。
            拍照时把四个角拖到纸边、让二维码留在框里——位置明显在框外的码不会被采用。
            识别只是猜测，进「待确认」后由你决定写不写。
          </p>

          {stage === 'pick' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setError(null);
                  setCameraOpen(true);
                }}
              >
                用相机拍
              </Button>
              <label className="cursor-pointer rounded-md border border-line bg-white/70 px-4 py-2 text-small transition duration-fast ease-standard hover:bg-white">
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
              <span className="text-caption opacity-35">
                也可以直接把照片拖进这个页面（拖拽在桌面端更快）
              </span>
            </div>
          ) : null}

          {busy ? <p className="text-small opacity-50">正在处理照片…</p> : null}
          {error ? (
            <Card tone="danger" padding="sm" elevation="none" className="text-small text-danger">
              {error}
            </Card>
          ) : null}
        </div>
      </Section>

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

      {missing !== null && stage === 'rebuild' ? (
        <Section title="这张纸缺少坐标记录">
          <Card padding="md" className="space-y-3 border-warn/40 bg-warn/10 text-small">
            <p>
              纸上的身份读出来了（模板 {missing.templateId}、{missing.date}、{missing.paper}），
              但本机没有这张纸打印时固化的坐标清单。多半是旧版本打印的：那个版本还没开始记录坐标。
            </p>
            <p className="opacity-70">
              可以按<strong>当前模板</strong>
              重建一份坐标继续扫。注意：重建用的是现在的作业列表，如果纸上
              行数或顺序和现在不同，勾选可能对到别的行——后面的「待确认」页会标出来，你可以
              逐条取消。最稳的做法还是用当前版本重新打印一次。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="md"
                disabled={busy}
                onClick={() => void rebuildAndContinue()}
              >
                按当前模板重建坐标并继续
              </Button>
              {onOpenPrint === undefined ? null : (
                <Button variant="secondary" onClick={onOpenPrint}>
                  去打印页重新打印
                </Button>
              )}
              <Button variant="ghost" onClick={reset}>
                取消
              </Button>
            </div>
          </Card>
        </Section>
      ) : null}

      {batch !== null && stage === 'review' ? (
        <Section
          title="待确认"
          actions={
            <>
              <span className="text-caption opacity-35">
                {batch.templateId} · {batch.paper}
              </span>
              <Button variant="secondary" onClick={reset}>
                扫下一张
              </Button>
            </>
          }
        >
          <ScanReview
            batch={batch}
            onSettled={() => {
              void refreshRecent();
            }}
          />
        </Section>
      ) : null}

      <Section title="最近的扫描">
        <div className="space-y-2">
          {recent.length === 0 ? (
            <EmptyState size="md">还没有扫描记录</EmptyState>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-line">
                {recent.map((item) => {
                  const selected = item.results.filter((result) => result.selected).length;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-2 px-4 py-2 text-small"
                    >
                      <span className="tabular-nums opacity-45">{item.date}</span>
                      <span className="opacity-50">{item.templateId}</span>
                      <span className="opacity-35">
                        {item.paper} · {selected} 项已识别
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <Badge
                          tone={
                            item.status === 'pending'
                              ? 'warn'
                              : item.status === 'applied'
                                ? 'ok'
                                : 'neutral'
                          }
                        >
                          {item.status === 'pending'
                            ? '待确认'
                            : item.status === 'applied'
                              ? '已回填'
                              : '已丢弃'}
                        </Badge>
                        {item.status === 'pending' ? (
                          <button
                            type="button"
                            onClick={() => void resume(item)}
                            className="text-caption opacity-50 transition-opacity duration-fast hover:opacity-80"
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
                            className="text-caption opacity-40 transition-opacity duration-fast hover:opacity-70"
                          >
                            重新打开
                          </button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <p className="text-caption opacity-35">
            今天：{dateKey(appClock)}。回填只写这张纸上的日期，不改其它天。
          </p>
        </div>
      </Section>

      {cameraOpen ? (
        <CameraCapture onCaptured={onCaptured} onCancel={() => setCameraOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * 条码里的模板短码 → 模板 id。
 *
 * 短码有 30 位，正常不会撞；真撞了（同一短码对上两个模板）就返回 null，
 * 让调用方提示重打，而不是猜一个。
 */
async function findTemplateIdByToken(token: string): Promise<string | null> {
  const customs = await listTemplates(db);
  const ids = new Set<string>([
    ...PRINT_TEMPLATE_CONSTANTS.map((template) => template.id),
    ...customs.map((template) => template.id),
  ]);
  const hits = [...ids].filter((id) => sheetCodeToken(id) === token);
  return hits.length === 1 ? (hits[0] ?? null) : null;
}
