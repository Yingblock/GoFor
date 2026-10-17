import { describe, expect, it } from 'vitest';
import {
  blockHeightMm,
  CELL_SIZE_MM,
  type CheckboxListBlock,
  type FocusGridBlock,
  type TimeLogBlock,
  type TitleBlock,
} from './blocks.js';
import { fitsOnePage, layout, normalizePlacement } from './layout.js';
import { contentBox, PAPER_SIZES, ROW_GAP_MM } from './paper.js';

const title: TitleBlock = { id: 't', kind: 'title', span: 12, text: '3月5日', align: 'left' };

const tasks = (rows: number, id = 'tasks'): CheckboxListBlock => ({
  id,
  kind: 'checkboxList',
  span: 12,
  bind: 'tasks.today',
  rows,
  showMeta: [],
});

const focusGrid: FocusGridBlock = {
  id: 'focus',
  kind: 'focusGrid',
  span: 12,
  bind: 'subjects.today',
  rows: 4,
  cells: 5,
  unitMinutes: 'period',
};

const morningLog: TimeLogBlock = {
  id: 'log-am',
  kind: 'timeLog',
  span: 12,
  dayPart: 'morning',
  rows: 2,
  label: '上午',
};

describe('版式：纸张与可用区域', () => {
  it('A5 扣除默认 8mm 边距', () => {
    const box = contentBox(PAPER_SIZES.A5);
    expect(box.widthMm).toBe(148 - 16);
    expect(box.heightMm).toBe(210 - 16);
  });

  it('索引卡是物理尺寸而不是整数', () => {
    expect(PAPER_SIZES['index-card'].widthMm).toBeCloseTo(76.2);
  });
});

describe('版式：区块高度是确定的', () => {
  it('清单高度 = 内边距 + 行数 × 行高', () => {
    expect(blockHeightMm(tasks(5))).toBe(8 + 5 * 7);
    expect(blockHeightMm(tasks(5)) - blockHeightMm(tasks(4))).toBe(7);
  });

  it('专注格按方格边长算', () => {
    expect(blockHeightMm(focusGrid)).toBe(8 + 4 * CELL_SIZE_MM);
  });

  it('时间登记行比普通行更高', () => {
    expect(blockHeightMm(morningLog)).toBe(8 + 2 * 11);
  });

  it('分页区块不占高度', () => {
    expect(blockHeightMm({ id: 'pb', kind: 'pageBreak', span: 12 })).toBe(0);
  });
});

describe('版式：排布', () => {
  it('单个整行区块按页边距定位', () => {
    const result = layout([title], { paper: 'A5' });
    expect(result.pages).toHaveLength(1);
    const placement = result.pages[0]?.placements[0];
    expect(placement?.xMm).toBe(8);
    expect(placement?.yMm).toBe(8);
    expect(placement?.widthMm).toBeCloseTo(132);
  });

  it('两个半行区块并排', () => {
    const left: CheckboxListBlock = { ...tasks(3, 'a'), span: 6 };
    const right: CheckboxListBlock = { ...tasks(3, 'b'), span: 6 };
    const result = layout([left, right], { paper: 'A5' });
    const [first, second] = result.pages[0]?.placements ?? [];
    expect(first?.yMm).toBe(second?.yMm);
    expect(second?.xMm).toBeCloseTo(8 + 66);
  });

  it('放不下就换行，行高取该行最高', () => {
    const left: CheckboxListBlock = { ...tasks(2, 'a'), span: 8 };
    const right: CheckboxListBlock = { ...tasks(5, 'b'), span: 8 };
    const result = layout([left, right], { paper: 'A5' });
    const [first, second] = result.pages[0]?.placements ?? [];
    expect(second?.xMm).toBe(8);
    expect(second?.yMm).toBeCloseTo((first?.yMm ?? 0) + (first?.heightMm ?? 0) + ROW_GAP_MM);
  });

  it('放得下就同一行，行高取最大值', () => {
    const short: CheckboxListBlock = { ...tasks(2, 'a'), span: 6 };
    const tall: CheckboxListBlock = { ...tasks(6, 'b'), span: 6 };
    const next = { ...title, id: 'next' };
    const result = layout([short, tall, next], { paper: 'A5' });
    const [first, second, third] = result.pages[0]?.placements ?? [];
    expect(second?.yMm).toBe(first?.yMm);
    expect(third?.yMm).toBeCloseTo((first?.yMm ?? 0) + (second?.heightMm ?? 0) + ROW_GAP_MM);
  });
});

describe('版式：分页', () => {
  it('内容超出一页时自动分页', () => {
    const blocks = Array.from({ length: 20 }, (_, i) => tasks(6, `list-${i}`));
    const result = layout(blocks, { paper: 'A5' });
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.dropped).toEqual([]);
  });

  it('分页区块强制换页', () => {
    const blocks = [title, { id: 'pb', kind: 'pageBreak' as const, span: 12 }, tasks(3)];
    const result = layout(blocks, { paper: 'A5' });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]?.placements).toHaveLength(1);
  });

  it('开头就是分页区块时不产生空白页', () => {
    const blocks = [{ id: 'pb', kind: 'pageBreak' as const, span: 12 }, title];
    const result = layout(blocks, { paper: 'A5' });
    expect(result.pages).toHaveLength(1);
  });

  it('单块高于整页时明确丢弃并告警，而不是偷偷裁掉', () => {
    const huge = tasks(100, 'huge');
    const result = layout([huge], { paper: 'A5' });
    expect(result.dropped).toEqual(['huge']);
    expect(result.warnings.join()).toContain('高于整页可用高度');
  });

  it('完整混合版（清单 8 项 + 专注格 + 三段时间登记）装不进 A5', () => {
    const fullDay = [
      title,
      tasks(8),
      focusGrid,
      morningLog,
      { ...morningLog, id: 'log-pm', dayPart: 'afternoon' as const, label: '下午' },
      { ...morningLog, id: 'log-eve', dayPart: 'evening' as const, label: '晚上' },
    ];
    // A5 可用高度只有 194mm，这个组合约需 210mm —— 这是实测出来的结论，
    // 不是参数拍脑袋：完整混合版必须用 A4，A5 只能放精简版。
    expect(fitsOnePage(fullDay, { paper: 'A5' })).toBe(false);
    expect(fitsOnePage(fullDay, { paper: 'A4' })).toBe(true);
  });

  it('精简版（清单 5 项 + 专注格 + 两段时间登记）能放进 A5', () => {
    const slimDay = [
      title,
      tasks(5),
      focusGrid,
      morningLog,
      { ...morningLog, id: 'log-eve', dayPart: 'evening' as const, label: '晚上' },
    ];
    expect(fitsOnePage(slimDay, { paper: 'A5' })).toBe(true);
  });

  it('行数多到装不下时 fitsOnePage 为 false', () => {
    expect(fitsOnePage([title, tasks(40)], { paper: 'A5' })).toBe(false);
  });
});

describe('版式：归一化坐标（回填识别用）', () => {
  it('坐标与扫描分辨率无关', () => {
    const result = layout([title], { paper: 'A5' });
    const page = result.pages[0];
    const placement = page?.placements[0];
    if (!page || !placement) throw new Error('未生成版式');

    const rect = normalizePlacement(placement, page);
    expect(rect.x).toBeCloseTo(8 / 148);
    expect(rect.w).toBeCloseTo(132 / 148);
    expect(rect.h).toBeCloseTo(10 / 210);
    expect(rect.y).toBeCloseTo(8 / 210);
  });
});

describe('版式：区块校验', () => {
  it('span 越界会告警但不会崩溃', () => {
    const bad: TitleBlock = { ...title, span: 20 };
    const result = layout([bad], { paper: 'A5' });
    expect(result.warnings.join()).toContain('span 必须是 1–12');
  });
});
