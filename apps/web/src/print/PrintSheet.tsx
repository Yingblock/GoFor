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
}

export interface PrintSheetProps {
  blocks: Block[];
  paper: PaperId;
  margin?: Margin;
  data: SheetData;
}

const mm = (value: number): string => `${value}mm`;

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
      return (
        <div
          style={{
            width: mm(block.sizeMm),
            height: mm(block.sizeMm),
            border: `${mm(0.3)} dashed #9ca3af`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: mm(2.4),
            color: '#9ca3af',
          }}
        >
          QR
        </div>
      );
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
  const scale = 0.62;

  return (
    // 外层按「缩放后的尺寸」占位，内层再做 transform——
    // 否则 transform 不改变布局盒，预览会被裁掉下半页。
    <div
      style={{
        width: mm(size.widthMm * scale),
        height: mm(size.heightMm * scale),
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
  );
}
