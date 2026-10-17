import { newId, systemClock } from '@gofor/core';
import { dateKey, type Task } from '@gofor/core/domain';
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
import { PrintPreview } from '../print/PrintSheet.tsx';

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
};

function todayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** 解析 `StoredTemplate.json`，坏数据返回 null 而不是崩页。 */
function parseTemplate(json: string): PrintTemplate | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<PrintTemplate>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return null;
  if (typeof candidate.paper !== 'string') return null;
  if (!Array.isArray(candidate.blocks)) return null;
  return candidate as PrintTemplate;
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
        className="w-14 rounded border border-black/10 bg-white/70 px-1.5 py-0.5"
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
        className={`rounded border border-black/10 bg-white/70 px-1.5 py-0.5 ${className}`}
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
        className="w-48 rounded border border-black/10 bg-white/70 px-1.5 py-0.5"
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
              className="rounded border border-black/10 bg-white/70 px-1 py-0.5"
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
  /** 当日课表，已排序；没有课就是空数组。编辑器只做预览，不负责算课表。 */
  schedule: { time: string; label: string }[];
}

/** 离线·M3 模板与校准页：选模板、改区块、换纸张、预览、打印。 */
export function TemplateEditorScreen({ schedule }: TemplateEditorScreenProps) {
  const today = dateKey(systemClock);
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_TEMPLATES[0]?.id ?? 'day');
  const [paper, setPaper] = useState<PaperId>('A4');
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const customs = useLiveQuery(() => listTemplates(db), [], undefined);

  const isCustom = selectedId.startsWith('custom:');
  const customId = isCustom ? selectedId.slice('custom:'.length) : null;
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
    const parsed = parseTemplate(stored.json);
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
      return draft ?? { id: customId ?? 'custom', name: '我的模板', paper, blocks: [] };
    }
    if (selectedId === CALIBRATION_TEMPLATE.id) return CALIBRATION_TEMPLATE;
    const builtin = BUILTIN_TEMPLATES.find((item) => item.id === selectedId);
    if (!builtin) return BUILTIN_TEMPLATES[0] ?? CALIBRATION_TEMPLATE;
    return paperFor(builtin.id, paper);
  }, [customId, draft, isCustom, paper, selectedId]);

  const blocks = useMemo(
    () => materialize(currentTemplate, { date: today, dateLabel: todayLabel(today) }),
    [currentTemplate, today],
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
    const saved: PrintTemplate = { ...draft, name };
    await putTemplate(db, {
      id: customId,
      name,
      json: JSON.stringify(saved),
      createdAt: stored?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    setNotice('已保存');
  }, [customId, draft, stored]);

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
    setSelectedId(`custom:${copy.id}`);
    setNotice('已复制，可以直接改');
  }, [currentTemplate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_360px]">
      {/* 左：模板列表 */}
      <aside className="space-y-3 text-sm">
        <h2 className="text-xs font-medium opacity-50">内置</h2>
        <ul className="space-y-0.5">
          {BUILTIN_TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`w-full rounded px-2 py-1 text-left text-[13px] ${
                  selectedId === template.id
                    ? 'bg-black/[0.06] font-medium'
                    : 'hover:bg-black/[0.03]'
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
                  ? 'bg-black/[0.06] font-medium'
                  : 'hover:bg-black/[0.03]'
              }`}
            >
              打印校准页
            </button>
          </li>
        </ul>

        <h2 className="pt-2 text-xs font-medium opacity-50">我的模板</h2>
        {customs === undefined ? (
          <p className="text-[11px] opacity-40">加载中…</p>
        ) : customs.length === 0 ? (
          <p className="text-[11px] opacity-40">还没有。选一个内置模板后点「复制」。</p>
        ) : (
          <ul className="space-y-0.5">
            {customs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(`custom:${item.id}`)}
                  className={`w-full rounded px-2 py-1 text-left text-[13px] ${
                    selectedId === `custom:${item.id}`
                      ? 'bg-black/[0.06] font-medium'
                      : 'hover:bg-black/[0.03]'
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
      <div className="space-y-4">
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
                className="w-48 rounded border border-black/10 bg-white/70 px-2 py-0.5 text-sm font-medium"
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
                  ? 'border-[var(--color-ink)] font-medium'
                  : 'border-black/10 opacity-60'
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
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
          >
            复制为我的模板
          </button>
          {isCustom ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-lg bg-[var(--color-ink)] px-3 py-1.5 text-xs text-white"
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
            onClick={() => window.print()}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
          >
            打印
          </button>
        </div>

        <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-white/50">
          {(draft?.blocks ?? currentTemplate.blocks).map((block, index) => (
            <li key={block.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="w-8 tabular-nums opacity-35">{index + 1}</span>
              <span className="w-28 font-mono text-[11px]">{block.kind}</span>
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
                className="rounded border border-black/10 px-2 py-1 opacity-70"
              >
                {kind}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] opacity-40">
            内置模板不可编辑。点「复制为我的模板」后可以增删区块、改内容与模板名、换纸张。
          </p>
        )}
      </div>

      {/* 右：预览 */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium opacity-50">预览</h2>
        <PrintPreview
          blocks={blocks}
          paper={currentTemplate.paper}
          data={{ tasks: [] as Task[], schedule }}
        />
        {selectedId === CALIBRATION_TEMPLATE.id ? (
          <p className="text-[11px] leading-relaxed opacity-45">
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
