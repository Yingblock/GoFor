import type { Task } from '@gofor/core/domain';
import {
  type Block,
  type CheckboxListBlock,
  layout,
  type Margin,
  PAPER_SIZES,
  type PageLayout,
  type PaperId,
  ROW_HEIGHT_MM,
  type ScheduleBlock,
  type TimeLogBlock,
} from '@gofor/core/print';
import { buildFillLink, encodeQrSvgPath } from '@gofor/core/scan';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，恢复 `new Date()`）。
import { appClock } from '../clock.ts';

/** 纸面渲染需要的数据。刻意保持扁平，方便以后换成任意来源。 */
export interface SheetData {
  tasks: Task[];
  /**
   * 当日课表，已按时间排好序；没有课就是空数组。
   *
   * 时间与科目名在宿主里算好再传进来：打印层只认「一行两列」的扁平数据，
   * 这样模板以后换数据源（手填、导入）时不用跟着改渲染。
   */
  schedule?: { time: string; label: string }[];
  /**
   * 打印这张纸时的身份：模板、日期、纸张。
   *
   * 二维码里写的就是这三样，扫描时靠它把纸对回"哪一天、哪套坐标"。
   * 不传就画一个虚线占位（旧模板、或还没接进来的调用方）。
   */
  qr?: { templateId: string; date: string; paper: string } | undefined;
}

export interface PrintSheetProps {
  blocks: Block[];
  paper: PaperId;
  margin?: Margin;
  data: SheetData;
}

const mm = (value: number): string => `${value}mm`;

/** CSS 里 1mm 恒等于 96/25.4 px；把毫米版式换算成像素才能判断要不要缩。 */
const PX_PER_MM = 96 / 25.4;

/** 桌面预览的默认比例：再大就比屏幕还宽，再小看不清。 */
const PREVIEW_SCALE = 0.62;

function TitleBlockView({ text }: { text: string }) {
  return <div style={{ fontSize: mm(5), fontWeight: 600, letterSpacing: '0.02em' }}>{text}</div>;
}

function CheckboxListView({ block, data }: { block: CheckboxListBlock; data: SheetData }) {
  const items = data.tasks.slice(0, block.rows);
  const hidden = Math.max(0, data.tasks.length - block.rows);

  return (
    <div>
      {Array.from({ length: block.rows }, (_, index) => {
        const task = items[index];
        return (
          <div
            key={task?.id ?? `empty-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: mm(2),
              height: mm(7),
              borderBottom: `${mm(0.2)} solid #dcdad2`,
            }}
          >
            <div
              style={{
                width: mm(4),
                height: mm(4),
                border: `${mm(0.3)} solid #4b5563`,
                borderRadius: mm(0.8),
                flex: 'none',
                background: task?.done ? '#4b5563' : 'transparent',
              }}
            />
            <span
              style={{ fontSize: mm(3.4), textDecoration: task?.done ? 'line-through' : 'none' }}
            >
              {task?.title ?? ''}
            </span>
          </div>
        );
      })}
      {hidden > 0 ? (
        <div style={{ fontSize: mm(2.8), color: '#6b7280', marginTop: mm(1) }}>
          +{hidden} 项见 App
        </div>
      ) : null}
    </div>
  );
}

/**
 * 当日课表。
 *
 * 行高与 checkboxList 一致（7mm），因为两者都是"一行一个条目"的书写行；
 * 高度必须等于 blockHeightMm 的 `8 + rows * 7`，否则分页会算错。
 * 数据多于 rows 时**不撑开版面**，而是把截断提示压在最后一行右侧，
 * 否则"预览好好的、打出来错位"——这个项目最不能接受的失败。
 */
function ScheduleView({ block, data }: { block: ScheduleBlock; data: SheetData }) {
  const entries = data.schedule ?? [];
  const hidden = Math.max(0, entries.length - block.rows);

  return (
    <div>
      <div style={{ fontSize: mm(3), fontWeight: 600, marginBottom: mm(1) }}>{block.title}</div>
      {Array.from({ length: block.rows }, (_, index) => {
        const entry = entries[index];
        // 截断提示只落在最后一行，避免额外多出一行把固定高度撑破。
        const overflow = index === block.rows - 1 ? hidden : 0;
        // 空课提示必须占**已有行的位置**：区块高度是 layout 算好的固定值，
        // 多插一行会顶到下一块，打印出来就错位了。
        const emptyNote = entries.length === 0 && index === 0;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 课表行是固定长度的位置槽位
            key={`schedule-row-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: mm(2),
              height: mm(ROW_HEIGHT_MM),
              borderBottom: `${mm(0.2)} solid #dcdad2`,
            }}
          >
            {emptyNote ? (
              <span style={{ fontSize: mm(2.8), color: '#9ca3af' }}>今日无课</span>
            ) : (
              <span
                style={{
                  width: mm(12),
                  flex: 'none',
                  fontSize: mm(3),
                  color: '#6b7280',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {entry?.time ?? ''}
              </span>
            )}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                fontSize: mm(3.4),
              }}
            >
              {entry?.label ?? ''}
            </span>
            {overflow > 0 ? (
              <span style={{ flex: 'none', fontSize: mm(2.6), color: '#6b7280' }}>
                {`+${overflow} 节课见 App`}
              </span>
            ) : null}
          </div>
        );
      })}
      {/* rows 为 0 时没有"最后一行"可放提示，单独补一行，别让数据静默消失。 */}
      {block.rows === 0 && hidden > 0 ? (
        <div style={{ fontSize: mm(2.8), color: '#6b7280' }}>{`+${hidden} 节课见 App`}</div>
      ) : null}
    </div>
  );
}

/** 一个空的时间槽。用描边而不是下划线：手写在框里不容易写出界。 */
function TimeSlot() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: mm(15),
        height: mm(6.5),
        border: `${mm(0.2)} solid #b9b6ad`,
        borderRadius: mm(1),
      }}
    />
  );
}

function TimeLogView({ block }: { block: TimeLogBlock }) {
  return (
    <div>
      <div style={{ fontSize: mm(3.2), fontWeight: 500, marginBottom: mm(1) }}>{block.label}</div>
      {Array.from({ length: block.rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 手写行是固定长度的位置槽位
          key={`log-row-${index}`}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: mm(2),
            height: mm(9),
            fontSize: mm(3),
            color: '#4b5563',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, borderBottom: `${mm(0.2)} solid #b9b6ad` }} />
          <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: mm(1.2) }}>
            <TimeSlot />
            <span style={{ fontSize: mm(3) }}>~</span>
            <TimeSlot />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 当前时间。
 *
 * 取的是**渲染那一刻**的本地时间，而不是数据里的某个时间戳——
 * 这样同一份数据每次打印都会印出当下的时间。
 * 注意：React 不会在 `window.print()` 时自动重渲染，所以如果页面开了很久，
 * 印出来的时间可能比实际打印时间早几分钟；这对"这张纸是什么时候打的"足够用。
 */
function TimestampView({ label }: { label: string }) {
  // TODO(debug-clock): 上线前删除（恢复 `new Date()`；改走 appClock 是为了让调试时钟影响"打印于"）。
  const now = new Date(appClock.now());
  const text = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: mm(2) }}>
      <span style={{ fontSize: mm(2.8), color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: mm(3), color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
        {text}
      </span>
    </div>
  );
}

/** 二维码：把「模板 + 日期 + 纸张」印在纸上，扫描时据此找回坐标清单。 */
function QrView({ sizeMm, data }: { sizeMm: number; data: SheetData }) {
  const qr = data.qr;
  if (qr === undefined) {
    return (
      <div
        style={{
          width: mm(sizeMm),
          height: mm(sizeMm),
          border: `${mm(0.3)} dashed #9ca3af`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: mm(2.4),
          color: '#9ca3af',
        }}
      >
        二维码
      </div>
    );
  }

  const link = buildFillLink({
    templateId: qr.templateId,
    date: qr.date,
    paper: qr.paper,
    version: 1,
  });
  const svg = encodeQrSvgPath(link);
  return (
    <svg
      role="img"
      aria-label="回填二维码"
      viewBox={`0 0 ${svg.size} ${svg.size}`}
      style={{ width: mm(sizeMm), height: mm(sizeMm), display: 'block' }}
    >
      <rect width={svg.size} height={svg.size} fill="#ffffff" />
      <path d={svg.path} fill="#111111" />
    </svg>
  );
}

/**
 * 睡眠 / 心情 / 专注这类 1–N 自评格。
 *
 * 为什么印成勾选格而不是"写数字"：写数字要 OCR 才读得回来，
 * 勾选格只要判断"这一格里有没有墨"，回填链路简单一个数量级（DESIGN §16.3）。
 */
/** 从 `Block` 联合里取评分格那一支，避免依赖 core 的导出清单。 */
type RatingGridLike = Extract<Block, { kind: 'ratingGrid' }>;

function RatingGridView({ block }: { block: RatingGridLike }) {
  return (
    <div>
      {block.labels.map((label) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: mm(2),
            // 行高必须正好 7mm 且从块顶开始铺：坐标清单按 rows × 7mm 等分采样窗，
            // 这里多一个 gap 就会让越靠下的行偏得越多（DESIGN §16.2）。
            height: mm(7),
            borderBottom: `${mm(0.2)} solid #dcdad2`,
          }}
        >
          <span style={{ width: mm(16), fontSize: mm(3), color: '#4b5563' }}>{label}</span>
          <span style={{ display: 'flex', gap: mm(1.5) }}>
            {Array.from({ length: block.scale }, (_, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 勾选格是固定长度的位置槽位
                key={`${label}-${index}`}
                style={{
                  width: mm(5),
                  height: mm(5),
                  border: `${mm(0.2)} solid #b9b6ad`,
                  borderRadius: mm(0.8),
                }}
              />
            ))}
          </span>
          <span style={{ fontSize: mm(2.4), color: '#9ca3af' }}>1 → {block.scale}</span>
        </div>
      ))}
    </div>
  );
}

function BlockView({ block, data }: { block: Block; data: SheetData }) {
  switch (block.kind) {
    case 'title':
      return <TitleBlockView text={block.text} />;
    case 'checkboxList':
      return <CheckboxListView block={block} data={data} />;
    case 'schedule':
      return <ScheduleView block={block} data={data} />;
    case 'timeLog':
      return <TimeLogView block={block} />;
    case 'slots':
      return (
        <div style={{ display: 'flex', gap: mm(4) }}>
          {block.labels.map((label) => (
            <div key={label} style={{ fontSize: mm(3), color: '#4b5563' }}>
              {label}
              <span
                style={{
                  display: 'inline-block',
                  width: mm(8),
                  marginLeft: mm(1.5),
                  borderBottom: `${mm(0.3)} solid #4b5563`,
                }}
              />
            </div>
          ))}
        </div>
      );
    case 'timestamp':
      return <TimestampView label={block.label} />;
    case 'hintLine':
      return <div style={{ fontSize: mm(2.8), color: '#6b7280' }}>{block.text}</div>;
    case 'footer':
      return <div style={{ fontSize: mm(2.6), color: '#9ca3af' }}>{block.text}</div>;
    case 'linedBox':
      return (
        <div>
          <div style={{ fontSize: mm(3), color: '#4b5563', marginBottom: mm(1) }}>
            {block.label}
          </div>
          {Array.from({ length: block.lines }, (_, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 横线是固定长度的位置槽位
              key={`line-${index}`}
              style={{ height: mm(7), borderBottom: `${mm(0.2)} solid #dcdad2` }}
            />
          ))}
        </div>
      );
    case 'qrcode':
      return <QrView sizeMm={block.sizeMm} data={data} />;
    case 'ratingGrid':
      return <RatingGridView block={block} />;
    case 'checkboxGrid':
    case 'table':
    case 'progressDots':
      return <div style={{ fontSize: mm(2.8), color: '#9ca3af' }}>[{block.kind}]</div>;
    case 'pageBreak':
      return null;
  }
}

function PageView({ page, data }: { page: PageLayout; data: SheetData }) {
  return (
    <div
      className="print-page"
      style={{
        position: 'relative',
        width: mm(page.widthMm),
        height: mm(page.heightMm),
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      {page.placements.map((placement) => (
        <div
          key={placement.block.id}
          style={{
            position: 'absolute',
            left: mm(placement.xMm),
            top: mm(placement.yMm),
            width: mm(placement.widthMm),
            height: mm(placement.heightMm),
          }}
        >
          <BlockView block={placement.block} data={data} />
        </div>
      ))}
    </div>
  );
}

/**
 * 打印层：屏幕上永远隐藏，只在 `@media print` 里显示。
 *
 * **必须渲染在 `.screen-only` 容器之外**——否则打印时连它一起被隐藏，
 * 结果就是一张白纸（这个坑真的踩过一次，已由 e2e 的 PDF 校验兜住）。
 */
export function PrintLayer({ blocks, paper, margin, data }: PrintSheetProps) {
  const result = layout(blocks, margin ? { paper, margin } : { paper });
  const size = PAPER_SIZES[paper];

  return (
    <div className="print-root">
      <style>{`@page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }`}</style>
      {result.pages.map((page) => (
        <PageView key={page.index} page={page} data={data} />
      ))}
    </div>
  );
}

/** 屏幕预览：与打印层同一套版式，只是缩放显示。 */
export function PrintPreview({ blocks, paper, margin, data }: PrintSheetProps) {
  const result = layout(blocks, margin ? { paper, margin } : { paper });
  const size = PAPER_SIZES[paper];
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState<number | null>(null);

  /*
   * 预览宽度跟着容器走：容器够宽就仍用原来的 0.62，窄屏（手机 360px）按比例缩到刚好放下。
   *
   * 关键边界：**只有预览缩，打印不缩**。真正打印的是 `PrintLayer`，它的毫米尺寸
   * 一个都没动；这里缩的只是屏幕上这一份 DOM，否则打出来的字会跟着变小、纸就废了。
   * 用 ResizeObserver 而不是只在挂载时算一次：折叠侧栏 / 转屏都会改变可用宽度。
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const measure = () => setHostWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const naturalWidthPx = size.widthMm * PX_PER_MM;
  const scale =
    hostWidth !== null && hostWidth > 0
      ? Math.min(PREVIEW_SCALE, hostWidth / naturalWidthPx)
      : PREVIEW_SCALE;

  return (
    // 外层按「缩放后的尺寸」占位，内层再做 transform——
    // 否则 transform 不改变布局盒，预览会被裁掉下半页。
    <div ref={hostRef} className="w-full min-w-0">
      <div
        style={{
          width: mm(size.widthMm * scale),
          // 多页时外层必须按「页数 × 页高」占位；只写一页会把第 2 页起全裁掉。
          height: mm(size.heightMm * scale * result.pages.length),
          overflow: 'hidden',
          filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.12))',
        }}
      >
        <div
          style={{
            width: mm(size.widthMm),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {result.pages.map((page) => (
            <PageView key={page.index} page={page} data={data} />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface PrintPreviewDialogProps extends PrintSheetProps {
  /** 显示在标题栏的模板名，让人确认「打的是这张模板」。 */
  templateName: string;
  onClose: () => void;
}

/**
 * 应用内打印预览（模态）。
 *
 * 为什么不是另画一份 HTML：**必须与真实打印是同一套 blocks / paper / data**。
 * 这里直接复用 `PageView`（`PrintLayer` 用的同一个渲染器）与同一个 `layout()`，
 * 只是按容器缩放、一次显示一页；真正的打印仍然由 `PrintLayer` 完成。
 * 以前出过「预览好好的、打出来错位」，任何"预览另写一套"的方案都会重蹈覆辙。
 */
export function PrintPreviewDialog({
  blocks,
  paper,
  margin,
  data,
  templateName,
  onClose,
}: PrintPreviewDialogProps) {
  const result = layout(blocks, margin ? { paper, margin } : { paper });
  const size = PAPER_SIZES[paper];
  const pageCount = result.pages.length;
  const [pageIndex, setPageIndex] = useState(0);
  const [hostWidth, setHostWidth] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // 换模板 / 换纸张可能让页数变少：把页码夹在有效范围内，别停在空白页。
  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  // Esc 关闭：模态层的基本预期，也避免困住键盘用户。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const measure = () => setHostWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const naturalWidthPx = size.widthMm * PX_PER_MM;
  // 预览最多 1:1，再大没有意义；两侧留 24px 给滚动条与阴影。
  const scale =
    hostWidth !== null && hostWidth > 0
      ? Math.min(1, Math.max(0, hostWidth - 24) / naturalWidthPx)
      : 1;

  const page = result.pages[pageIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="打印预览"
      className="fixed inset-0 z-50 flex flex-col bg-black/30 p-2 sm:p-6 animate-fade-in"
    >
      <div className="mx-auto flex h-full w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-2xl bg-paper shadow-pop animate-pop-in">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium">打印预览</h2>
          <span className="text-xs opacity-50">
            {templateName} · {size.name}（{size.widthMm}×{size.heightMm}mm） · {pageCount} 页
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭打印预览"
            className="rounded border border-line px-2 py-0.5 text-xs opacity-60"
          >
            ✕
          </button>
        </header>

        <div ref={hostRef} className="min-h-0 flex-1 overflow-auto bg-black/[0.06] p-3">
          <div
            className="mx-auto"
            style={{
              width: mm(size.widthMm * scale),
              height: mm(size.heightMm * scale),
              filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.18))',
            }}
          >
            <div
              style={{
                width: mm(size.widthMm),
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {page ? <PageView page={page} data={data} /> : null}
            </div>
          </div>
        </div>

        {pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-2 text-xs">
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={pageIndex === 0}
              className="rounded border border-line px-2 py-0.5 disabled:opacity-30"
            >
              上一页
            </button>
            <span className="tabular-nums opacity-60">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              disabled={pageIndex >= pageCount - 1}
              className="rounded border border-line px-2 py-0.5 disabled:opacity-30"
            >
              下一页
            </button>
          </div>
        ) : null}

        <div className="border-t border-line px-4 py-2 text-caption leading-relaxed opacity-55">
          系统打印框里请把纸张选成 <strong>{size.name}</strong>（{size.widthMm}×{size.heightMm}
          mm），缩放选 <strong>100%</strong>（不要「适合页面」），
          关闭页眉页脚，并勾选「背景图形」。边距由纸面版式负责，不要再加打印机边距。
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-xs"
          >
            返回
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs text-white"
          >
            继续打印
          </button>
        </div>
      </div>
    </div>
  );
}
