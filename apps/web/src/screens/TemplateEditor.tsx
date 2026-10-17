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

function hasRows(block: Block): block is Block & { rows: number } {
  return 'rows' in block && typeof (block as { rows?: unknown }).rows === 'number';
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

  const save = useCallback(async () => {
    if (!draft || !customId) return;
    await putTemplate(db, {
      id: customId,
      name: draft.name,
      json: JSON.stringify(draft),
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
          <span className="text-sm font-medium">{currentTemplate.name}</span>
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
            <li key={block.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="w-8 tabular-nums opacity-35">{index + 1}</span>
              <span className="w-28 font-mono text-[11px]">{block.kind}</span>
              {hasRows(block) && draft ? (
                <label className="flex items-center gap-1 opacity-70">
                  <span>行</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={block.rows}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        blocks: current.blocks.map((item) =>
                          item.id === block.id
                            ? { ...item, rows: Number(event.target.value) }
                            : item,
                        ),
                      }))
                    }
                    className="w-14 rounded border border-black/10 bg-white/70 px-1.5 py-0.5"
                  />
                </label>
              ) : null}
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
            内置模板不可编辑。点「复制为我的模板」后可以增删区块、改行数、换纸张。
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
