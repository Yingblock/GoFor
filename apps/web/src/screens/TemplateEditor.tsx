import { newId } from '@gofor/core';
import { dateKey } from '@gofor/core/domain';
import {
  type Block,
  BUILTIN_TEMPLATES,
  CALIBRATION_TEMPLATE,
  layout,
  materialize,
  PAPER_IDS,
  PAPER_SIZES,
  type PaperId,
  type PrintTemplate,
  paperFor,
} from '@gofor/core/print';
import { db, listTemplates, putTemplate } from '@gofor/store';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';
import { PrintPreview, type SheetData } from '../print/PrintSheet.tsx';
import {
  CUSTOM_TEMPLATE_PREFIX,
  customIdFromSelection,
  editorSelectionId,
  parseStoredTemplate,
} from '../print/template.ts';

// 直接复用 core 的纸张清单：再手写一份数组就会在新增尺寸时悄悄过期。
const PAPER_OPTIONS: readonly PaperId[] = PAPER_IDS;

/** 可加进模板的区块种类与默认值。 */
const BLOCK_PRESETS: Record<string, () => Block> = {
  title: () => ({ id: newId(), kind: 'title', span: 12, text: '', align: 'left' }),
  checkboxList: () => ({
    id: newId(),
    kind: 'checkboxList',
    span: 12,
    bind: 'tasks.today',
    rows: 5,
    showMeta: [],
  }),
  timeLog: () => ({
    id: newId(),
    kind: 'timeLog',
    span: 12,
    dayPart: 'morning',
    rows: 1,
    label: '时段',
  }),
  linedBox: () => ({ id: newId(), kind: 'linedBox', span: 12, label: '备注', lines: 3 }),
  schedule: () => ({ id: newId(), kind: 'schedule', span: 12, rows: 8, title: '今日课表' }),
  hintLine: () => ({
    id: newId(),
    kind: 'hintLine',
    span: 12,
    text: '深色笔 · 不出框 · 不连笔',
  }),
  slots: () => ({
    id: newId(),
    kind: 'slots',
    span: 12,
    labels: ['睡眠', '心情', '专注'],
  }),
  // 渲染层在打印那一刻取时刻，区块只存前缀文案，所以默认值只给 label。
  timestamp: () => ({ id: newId(), kind: 'timestamp', span: 12, label: '打印于' }),
  // 回填二维码：内容由打印层按「模板 + 日期 + 纸张」现算，区块只存边长。
  qrcode: () => ({ id: newId(), kind: 'qrcode', span: 3, sizeMm: 12 }),
  // 打卡行：一行并排当天该做的习惯，扫描按 habit id 回填（P2-2.13）。
  habitRow: () => ({ id: newId(), kind: 'habitRow', span: 12 }),
  // 三格自评：印成 1–5 的勾选格，扫描能读回数值（手写数字读不了，见 DESIGN §16.3）。
  ratingGrid: () => ({
    id: newId(),
    kind: 'ratingGrid',
    span: 12,
    labels: ['睡眠', '心情', '专注'],
    keys: ['sleep', 'mood', 'focus'],
    scale: 5,
  }),
};

function todayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** `YYYY-MM-DD` 加天数；只处理合法输入。 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 数字输入框：解析失败就丢弃这次输入，草稿里永远不会出现 NaN 或负值。 */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 opacity-70">
      <span className="shrink-0">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isFinite(parsed)) return;
          onChange(Math.min(max, Math.max(min, parsed)));
        }}
        className="w-14 rounded border border-line bg-card-soft px-1.5 py-0.5"
      />
    </label>
  );
}

/** 单行文本输入，宽度由调用方按字段长度给。 */
function TextField({
  label,
  value,
  onChange,
  className = 'w-40',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className="flex items-center gap-1 opacity-70">
      <span className="shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded border border-line bg-card-soft px-1.5 py-0.5 ${className}`}
      />
    </label>
  );
}

/**
 * `slots.labels` 是数组，不能每个按键都 split 回数组：
 * 用户刚敲下逗号时 split 会产出空串，光标和已输入内容都会被受控值改掉。
 * 所以本地保留原始文本，回车或失焦时才提交成干净的数组。
 */
function SlotsLabelsField({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const [text, setText] = useState(() => labels.join('，'));

  // 只有外部真的换了 labels（切模板/重载）才回填；打字时 labels 引用不变，不会被覆盖。
  useEffect(() => {
    setText(labels.join('，'));
  }, [labels]);

  const commit = () => {
    // 中文输入法打出来的是全角逗号，两种都当分隔符，否则用户得手动切半角。
    onChange(
      text
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    );
  };

  return (
    <label className="flex items-center gap-1 opacity-70">
      <span className="shrink-0">格名</span>
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        className="w-48 rounded border border-line bg-card-soft px-1.5 py-0.5"
      />
    </label>
  );
}

const DAY_PARTS = ['morning', 'afternoon', 'evening'] as const;

const DAY_PART_LABELS: Record<(typeof DAY_PARTS)[number], string> = {
  morning: '早',
  afternoon: '午',
  evening: '晚',
};

/**
 * 按区块 kind 给出可编辑字段。
 *
 * 为什么用 switch 而不是通用「改属性」控件：每种区块的字段是声明式版式的一部分，
 * 用 switch 能在编译期保证只写该 kind 存在的字段（例如 footer 没有 rows），
 * 避免手滑改出一个 layout/渲染层处理不了的区块。
 */
function BlockFields({ block, onChange }: { block: Block; onChange: (next: Block) => void }) {
  switch (block.kind) {
    case 'title':
      return (
        <TextField
          label="文本"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          className="w-56"
        />
      );
    case 'hintLine':
    case 'footer':
      return (
        <TextField
          label="文本"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          className="w-56"
        />
      );
    case 'linedBox':
      return (
        <>
          <TextField
            label="标题"
            value={block.label}
            onChange={(label) => onChange({ ...block, label })}
          />
          <NumberField
            label="行"
            value={block.lines}
            min={0}
            max={20}
            onChange={(lines) => onChange({ ...block, lines })}
          />
        </>
      );
    case 'timeLog':
      return (
        <>
          <TextField
            label="标题"
            value={block.label}
            onChange={(label) => onChange({ ...block, label })}
            className="w-32"
          />
          <NumberField
            label="行"
            value={block.rows}
            min={0}
            max={20}
            onChange={(rows) => onChange({ ...block, rows })}
          />
          <label className="flex items-center gap-1 opacity-70">
            <span className="shrink-0">时段</span>
            <select
              value={block.dayPart}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'morning' || value === 'afternoon' || value === 'evening') {
                  onChange({ ...block, dayPart: value });
                }
              }}
              className="rounded border border-line bg-card-soft px-1 py-0.5"
            >
              {DAY_PARTS.map((part) => (
                <option key={part} value={part}>
                  {DAY_PART_LABELS[part]}
                </option>
              ))}
            </select>
          </label>
        </>
      );
    case 'schedule':
      return (
        <>
          <TextField
            label="标题"
            value={block.title}
            onChange={(title) => onChange({ ...block, title })}
          />
          <NumberField
            label="行"
            value={block.rows}
            min={0}
            max={20}
            onChange={(rows) => onChange({ ...block, rows })}
          />
        </>
      );
    case 'timestamp':
      // 时刻是打印时取的，这里只能改前缀文案。
      return (
        <TextField
          label="文案"
          value={block.label}
          onChange={(label) => onChange({ ...block, label })}
        />
      );
    case 'checkboxList':
      return (
        <>
          <NumberField
            label="行"
            value={block.rows}
            min={0}
            max={20}
            onChange={(rows) => onChange({ ...block, rows })}
          />
          <TextField
            label="绑定"
            value={block.bind}
            onChange={(bind) => onChange({ ...block, bind })}
            className="w-28"
          />
        </>
      );
    case 'slots':
      return (
        <SlotsLabelsField
          labels={block.labels}
          onChange={(labels) => onChange({ ...block, labels })}
        />
      );
    case 'qrcode':
      return (
        <NumberField
          label="边长 mm"
          value={block.sizeMm}
          min={5}
          max={100}
          onChange={(sizeMm) => onChange({ ...block, sizeMm })}
        />
      );
    case 'habitRow':
      // 习惯列表来自数据，不在模板里配置；这里没有可编辑字段。
      return null;
    case 'table':
      return (
        <NumberField
          label="行"
          value={block.rows}
          min={0}
          max={20}
          onChange={(rows) => onChange({ ...block, rows })}
        />
      );
    case 'checkboxGrid':
      return (
        <NumberField
          label="行"
          value={block.rows}
          min={0}
          max={20}
          onChange={(rows) => onChange({ ...block, rows })}
        />
      );
    case 'pageBreak':
      return null;
    default:
      // progressDots 等暂无用户可填字段；不认识的类型宁可只读，也不要猜着改。
      return null;
  }
}

export interface TemplateEditorScreenProps {
  /** 按日期现算纸面数据（任务/课表/备注/打卡/二维码），与打印页同一份逻辑。 */
  buildSheetData: (date: string, templateId: string) => SheetData;
  /** 配置里当前的模板 id：进页面就选中它，避免「看到的不是要打印的那张」。 */
  initialTemplateId: string;
  /** 配置里当前的纸张。 */
  initialPaper: PaperId;
  /**
   * 打印前把「当前模板 id + 当前纸张」写进配置，并等打印层完成重排。
   * 返回 false 表示写库失败，调用方不要继续 `window.print()`（否则打的是旧模板）。
   */
  onPrint: (templateId: string, paper: PaperId) => Promise<boolean>;
}

/** 离线·M3 模板与校准页：选模板、改区块、换纸张、预览、打印。 */
export function TemplateEditorScreen({
  buildSheetData,
  initialTemplateId,
  initialPaper,
  onPrint,
}: TemplateEditorScreenProps) {
  const today = dateKey(appClock);
  const [previewDate, setPreviewDate] = useState<string>(() => addDays(today, 1));
  const [selectedId, setSelectedId] = useState<string>(() => editorSelectionId(initialTemplateId));
  const [paper, setPaper] = useState<PaperId>(initialPaper);
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const customs = useLiveQuery(() => listTemplates(db), [], undefined);

  const customId = customIdFromSelection(selectedId);
  const isCustom = customId !== null;
  const stored = customs?.find((item) => item.id === customId);

  // 选中自定义模板时把它载入草稿；切走即丢弃未保存修改
  useEffect(() => {
    if (!isCustom) {
      setDraft(null);
      return;
    }
    if (!stored) {
      setDraft(null);
      return;
    }
    const parsed = parseStoredTemplate(stored.json);
    if (!parsed) {
      setNotice('这个模板的数据损坏，无法编辑');
      setDraft(null);
      return;
    }
    setDraft(parsed);
    setPaper(parsed.paper);
  }, [isCustom, stored]);

  const currentTemplate = useMemo<PrintTemplate>(() => {
    if (isCustom) {
      // 纸张是全局打印设置：草稿里的 paper 字段跟随当前选择，预览与打印才不会分叉。
      return draft
        ? { ...draft, paper }
        : { id: customId ?? 'custom', name: '我的模板', paper, blocks: [] };
    }
    if (selectedId === CALIBRATION_TEMPLATE.id) {
      // 校准页也必须跟随纸张选择，否则一直是 A4。
      return paperFor(CALIBRATION_TEMPLATE.id, paper);
    }
    const builtin = BUILTIN_TEMPLATES.find((item) => item.id === selectedId);
    if (!builtin) return paperFor(BUILTIN_TEMPLATES[0]?.id ?? 'day', paper);
    return paperFor(builtin.id, paper);
  }, [customId, draft, isCustom, paper, selectedId]);

  const blocks = useMemo(
    () =>
      materialize(currentTemplate, {
        date: previewDate,
        dateLabel: todayLabel(previewDate),
      }),
    [currentTemplate, previewDate],
  );

  const pageCount = layout(blocks, { paper: currentTemplate.paper }).pages.length;

  const updateDraft = useCallback((patch: (current: PrintTemplate) => PrintTemplate) => {
    setDraft((current) => (current ? patch(current) : current));
    setNotice(null);
  }, []);

  // 行内编辑统一按区块 id 替换：id 是模板内稳定的，不用数组下标，移动/删除后不会串行。
  const replaceBlock = useCallback(
    (next: Block) => {
      updateDraft((current) => ({
        ...current,
        blocks: current.blocks.map((item) => (item.id === next.id ? next : item)),
      }));
    },
    [updateDraft],
  );

  const save = useCallback(async () => {
    if (!draft || !customId) return;
    // 列表显示 `StoredTemplate.name`、打印用 `json.name`：两处写同一个值，
    // 否则改名后左侧列表会还显示旧名字，和模板内容对不上。
    const name = draft.name.trim() === '' ? '我的模板' : draft.name.trim();
    // 纸张是当前预览用的那张：一起存进去，重新打开模板时不会跳回旧纸。
    const saved: PrintTemplate = { ...draft, name, paper };
    await putTemplate(db, {
      id: customId,
      name,
      json: JSON.stringify(saved),
      createdAt: stored?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    setDraft(saved);
    setNotice('已保存');
  }, [customId, draft, paper, stored]);

  const duplicate = useCallback(async () => {
    const copy: PrintTemplate = {
      ...currentTemplate,
      id: newId(),
      name: `${currentTemplate.name}（我的）`,
      blocks: currentTemplate.blocks.map((block) => ({ ...block, id: newId() })),
    };
    await putTemplate(db, {
      id: copy.id,
      name: copy.name,
      json: JSON.stringify(copy),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSelectedId(`${CUSTOM_TEMPLATE_PREFIX}${copy.id}`);
    setNotice('已复制，可以直接改');
  }, [currentTemplate]);

  /**
   * 打印当前模板。
   *
   * 顺序不能换：**先把「当前模板 + 当前纸张」写进配置，再 `window.print()`**。
   * `PrintLayer` 只读配置，先打印再写配置的话，纸上还是上一张模板/上一张纸——
   * 这正是用户报的「模板与校准页打印的不是当前模板」。
   */
  const printCurrent = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      // 自定义模板：打印的是「所见」，未保存的修改先落库，否则打印层会读到旧 JSON。
      if (isCustom && draft && customId) await save();
      const ok = await onPrint(currentTemplate.id, currentTemplate.paper);
      if (!ok) {
        setNotice('打印设置没写进配置，已取消打印（请重试）');
        return;
      }
      window.print();
    } catch (error) {
      console.warn('打印失败', error);
      setNotice('打印失败，请重试');
    } finally {
      setPrinting(false);
    }
  }, [
    currentTemplate.id,
    currentTemplate.paper,
    customId,
    draft,
    isCustom,
    onPrint,
    printing,
    save,
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)_360px]">
      {/* 左：模板列表 */}
      <aside className="min-w-0 space-y-3 text-sm">
        <h2 className="text-xs font-medium opacity-50">内置</h2>
        <ul className="space-y-0.5">
          {BUILTIN_TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`w-full rounded px-2 py-1 text-left text-[13px] ${
                  selectedId === template.id ? 'bg-overlay font-medium' : 'hover:bg-overlay'
                }`}
              >
                {template.name}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setSelectedId(CALIBRATION_TEMPLATE.id)}
              className={`w-full rounded px-2 py-1 text-left text-[13px] ${
                selectedId === CALIBRATION_TEMPLATE.id
                  ? 'bg-overlay font-medium'
                  : 'hover:bg-overlay'
              }`}
            >
              打印校准页
            </button>
          </li>
        </ul>

        <h2 className="pt-2 text-xs font-medium opacity-50">我的模板</h2>
        {customs === undefined ? (
          <p className="text-caption opacity-40">加载中…</p>
        ) : customs.length === 0 ? (
          <p className="text-caption opacity-40">还没有。选一个内置模板后点「复制」。</p>
        ) : (
          <ul className="space-y-0.5">
            {customs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(`${CUSTOM_TEMPLATE_PREFIX}${item.id}`)}
                  className={`w-full rounded px-2 py-1 text-left text-[13px] ${
                    selectedId === `${CUSTOM_TEMPLATE_PREFIX}${item.id}`
                      ? 'bg-overlay font-medium'
                      : 'hover:bg-overlay'
                  }`}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* 中：编辑区 */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {isCustom && draft ? (
            // 自定义模板名可改；内置模板仍是常量，只读展示。
            <label className="flex items-center gap-1">
              <span className="text-xs opacity-50">名称</span>
              <input
                type="text"
                aria-label="模板名称"
                value={draft.name}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="w-48 rounded border border-line bg-card-soft px-2 py-0.5 text-sm font-medium"
              />
            </label>
          ) : (
            <span className="text-sm font-medium">{currentTemplate.name}</span>
          )}
          {PAPER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setPaper(option);
                if (draft) updateDraft((current) => ({ ...current, paper: option }));
              }}
              className={`rounded border px-2 py-0.5 text-xs ${
                currentTemplate.paper === option
                  ? 'border-[var(--color-strong)] font-medium'
                  : 'border-line opacity-60'
              }`}
            >
              {PAPER_SIZES[option].name}
            </button>
          ))}
          <span className={`text-xs ${pageCount > 1 ? 'text-amber-600' : 'opacity-40'}`}>
            共 {pageCount} 页{pageCount > 1 ? '（超出一页）' : ''}
          </span>
        </div>

        {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void duplicate()}
            className="rounded-lg border border-line px-3 py-1.5 text-xs"
          >
            复制为我的模板
          </button>
          {isCustom ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-lg bg-strong px-3 py-1.5 text-xs text-on-strong"
              >
                保存
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!customId) return;
                  await db.templates.delete(customId);
                  setSelectedId(BUILTIN_TEMPLATES[0]?.id ?? 'day');
                  setNotice('已删除');
                }}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600"
              >
                删除
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void printCurrent()}
            disabled={printing}
            title="先把当前模板与纸张设为打印预设，再打开系统打印框"
            className="rounded-lg bg-strong px-3 py-1.5 text-xs text-on-strong disabled:opacity-60"
          >
            {printing ? '准备打印…' : '打印这个模板'}
          </button>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line bg-card-faint">
          {(draft?.blocks ?? currentTemplate.blocks).map((block, index) => (
            <li key={block.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="w-8 tabular-nums opacity-35">{index + 1}</span>
              <span className="w-28 font-mono text-caption">{block.kind}</span>
              {draft ? <BlockFields block={block} onChange={replaceBlock} /> : null}
              <span className="flex-1" />
              {draft ? (
                <>
                  <button
                    type="button"
                    aria-label={`上移 ${block.kind}`}
                    onClick={() => updateDraft((current) => moveBlock(current, index, -1))}
                    className="px-1 opacity-50"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`下移 ${block.kind}`}
                    onClick={() => updateDraft((current) => moveBlock(current, index, 1))}
                    className="px-1 opacity-50"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${block.kind}`}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        blocks: current.blocks.filter((item) => item.id !== block.id),
                      }))
                    }
                    className="px-1 opacity-50"
                  >
                    删除
                  </button>
                </>
              ) : (
                <span className="text-[10px] opacity-30">内置模板只读</span>
              )}
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="opacity-60">加区块</span>
            {Object.keys(BLOCK_PRESETS).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  const preset = BLOCK_PRESETS[kind];
                  if (!preset) return;
                  updateDraft((current) => ({ ...current, blocks: [...current.blocks, preset()] }));
                }}
                className="rounded border border-line px-2 py-1 opacity-70"
              >
                {kind}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-caption opacity-40">
            内置模板不可编辑。点「复制为我的模板」后可以增删区块、改内容与模板名、换纸张。
          </p>
        )}
      </div>

      {/* 右：预览 */}
      <div className="min-w-0 space-y-2">
        <h2 className="text-xs font-medium opacity-50">预览</h2>
        <PrintPreview
          blocks={blocks}
          paper={currentTemplate.paper}
          data={buildSheetData(previewDate, currentTemplate.id)}
        />
        <label className="flex items-center gap-2 text-caption opacity-60">
          <span>预览日期</span>
          <input
            type="date"
            aria-label="预览日期"
            value={previewDate}
            onChange={(event) => {
              if (event.target.value !== '') setPreviewDate(event.target.value);
            }}
            className="rounded-md border border-line bg-card px-2 py-1 text-xs"
          />
          <span className="opacity-50">默认明天；改日期可看当天纸面</span>
        </label>
        {selectedId === CALIBRATION_TEMPLATE.id ? (
          <p className="text-caption leading-relaxed opacity-45">
            每台打印机第一次使用前打一张：确认有没有被整体缩放、四角有没有被裁掉。
            目前是近似刻度（用行高模拟），精确毫米刻度需要后续新增 ruler 区块。
          </p>
        ) : null}
      </div>
    </div>
  );
}

function moveBlock(template: PrintTemplate, index: number, delta: -1 | 1): PrintTemplate {
  const target = index + delta;
  if (target < 0 || target >= template.blocks.length) return template;
  const blocks = [...template.blocks];
  const current = blocks[index];
  const other = blocks[target];
  if (!current || !other) return template;
  blocks[index] = other;
  blocks[target] = current;
  return { ...template, blocks };
}
