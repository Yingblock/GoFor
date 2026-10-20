import { describe, expect, it } from 'vitest';
import type {
  Block,
  CheckboxGridBlock,
  CheckboxListBlock,
  RatingGridBlock,
  TimeLogBlock,
} from '../print/blocks.ts';
import { fiducialBottomTopMm } from '../print/blocks.ts';
import { layout, normalizePlacement } from '../print/layout.ts';
import { buildSheetManifest, type ManifestInput } from './manifest.ts';

const taskList = (rows: number, id = 'tasks'): CheckboxListBlock => ({
  id,
  kind: 'checkboxList',
  span: 12,
  bind: 'tasks.today',
  rows,
  showMeta: [],
});

const rating = (overrides: Partial<RatingGridBlock> = {}): RatingGridBlock => ({
  id: 'mood',
  kind: 'ratingGrid',
  span: 12,
  labels: ['睡眠', '心情', '专注'],
  scale: 5,
  keys: ['sleep', 'mood', 'focus'],
  ...overrides,
});

const habitGrid: CheckboxGridBlock = {
  id: 'habits',
  kind: 'checkboxGrid',
  span: 12,
  cols: 3,
  rows: 2,
};

const input = (blocks: Block[], overrides: Partial<ManifestInput> = {}): ManifestInput => ({
  templateId: 'day',
  date: '2026-03-05',
  paper: 'A5',
  blocks,
  ...overrides,
});

describe('坐标注册表：checkboxList', () => {
  it('单行坐标只覆盖勾选框（5mm），且是整页归一化坐标', () => {
    const blocks = [taskList(1)];
    const manifest = buildSheetManifest(input(blocks));
    const page = layout(blocks, { paper: 'A5' }).pages[0];
    if (page === undefined) throw new Error('缺少页面');
    const placement = page.placements[0];
    if (placement === undefined) throw new Error('缺少 placement');
    const expected = normalizePlacement(placement, page);

    const target = manifest.pages[0]?.targets[0];
    // 只覆盖内容区：1 行 × 7mm ÷ 块高 15mm（8mm 底部留白不采样）
    expect(target?.rect.x).toBeCloseTo(expected.x);
    expect(target?.rect.y).toBeCloseTo(expected.y);
    // 采样窗只取行首的勾选框（5mm），不覆盖整行的印刷标题。
    expect(target?.rect.w).toBeCloseTo(5 / 148);
    expect(target?.rect.h).toBeCloseTo((expected.h * 7) / 15);
    // A5 宽 148mm、默认边距 8mm：整页坐标从 8/148 开始。
    expect(target?.rect.x).toBeCloseTo(8 / 148);
    expect(target?.rect.y).toBeCloseTo(8 / 210);
    expect(target?.rect.w).toBeLessThan((148 - 16) / 148);
    expect(target?.rect.w).toBeLessThanOrEqual(1);
    expect(target?.rect.h).toBeLessThanOrEqual(1);
  });

  it('行数决定 target 数，且纵向等分', () => {
    const manifest = buildSheetManifest(input([taskList(3)]));
    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets.map((target) => target.targetId)).toEqual(['tasks/r1', 'tasks/r2', 'tasks/r3']);
    expect(new Set(targets.map((target) => target.kind))).toEqual(new Set(['checkbox']));
    const [first, second, third] = targets;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('target 数量不对');
    }
    expect(first.rect.h).toBeCloseTo(second.rect.h);
    expect(second.rect.h).toBeCloseTo(third.rect.h);
    expect(first.rect.y).toBeLessThan(second.rect.y);
    expect(second.rect.y).toBeLessThan(third.rect.y);
    expect(first.rect.x).toBeCloseTo(second.rect.x);
  });

  it('bindings 缺省时 payload 为 null', () => {
    const manifest = buildSheetManifest(input([taskList(2)]));
    for (const target of manifest.pages[0]?.targets ?? []) {
      expect(target.payload).toBeNull();
      expect(target.applyPayload).toBeNull();
    }
  });

  it('bindings 把第 N 行映射回任务 id，并带 task: 写库前缀', () => {
    const manifest = buildSheetManifest(
      input([taskList(2)], { bindings: { 'tasks.today': ['t1', 't2'] } }),
    );
    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets.map((target) => target.payload)).toEqual(['t1', 't2']);
    expect(targets.map((target) => target.applyPayload)).toEqual(['task:t1', 'task:t2']);
  });

  it('bind 名以 habits 开头时映射成 habit: 前缀（打卡行）', () => {
    const habitList: CheckboxListBlock = {
      id: 'habits',
      kind: 'checkboxList',
      span: 12,
      bind: 'habits.daily',
      rows: 2,
      showMeta: [],
    };
    const manifest = buildSheetManifest(
      input([habitList], { bindings: { 'habits.daily': ['h1', 'h2'] } }),
    );
    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets.map((target) => target.payload)).toEqual(['h1', 'h2']);
    expect(targets.map((target) => target.applyPayload)).toEqual(['habit:h1', 'habit:h2']);
  });

  it('labels 给行标签；缺省用「第 N 行」', () => {
    const labeled = buildSheetManifest(
      input([taskList(2)], { labels: { 'tasks.today': ['数学卷子 3.1', '英语背诵'] } }),
    );
    expect(labeled.pages[0]?.targets.map((target) => target.label)).toEqual([
      '数学卷子 3.1',
      '英语背诵',
    ]);

    const bare = buildSheetManifest(input([taskList(2)]));
    expect(bare.pages[0]?.targets.map((target) => target.label)).toEqual(['第 1 行', '第 2 行']);
  });
});

describe('坐标注册表：ratingGrid', () => {
  it('每行 scale 个格子，value 从 1 开始，payload 带 mood: 前缀', () => {
    const manifest = buildSheetManifest(input([rating()]));
    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets).toHaveLength(3 * 5);

    const firstRow = targets.slice(0, 5);
    expect(firstRow.map((target) => target.value)).toEqual([1, 2, 3, 4, 5]);
    expect(firstRow.map((target) => target.targetId)).toEqual([
      'mood/r1c1',
      'mood/r1c2',
      'mood/r1c3',
      'mood/r1c4',
      'mood/r1c5',
    ]);
    expect(firstRow.map((target) => target.label)).toEqual([
      '睡眠 1 分',
      '睡眠 2 分',
      '睡眠 3 分',
      '睡眠 4 分',
      '睡眠 5 分',
    ]);
    expect(new Set(targets.map((target) => target.kind))).toEqual(new Set(['slider']));
    // 同一行的 scale 个格子共用一个数据键，写库层按 mood:sleep 回填数值。
    expect(firstRow.map((target) => target.payload)).toEqual(Array(5).fill('sleep'));
    expect(firstRow.map((target) => target.applyPayload)).toEqual(Array(5).fill('mood:sleep'));
  });

  it('keys 缺省时 payload 为 null', () => {
    const noKeys: RatingGridBlock = {
      id: 'mood',
      kind: 'ratingGrid',
      span: 12,
      labels: ['睡眠'],
      scale: 3,
    };
    const manifest = buildSheetManifest(input([noKeys]));
    for (const target of manifest.pages[0]?.targets ?? []) {
      expect(target.payload).toBeNull();
      expect(target.applyPayload).toBeNull();
    }
  });
});

describe('坐标注册表：checkboxGrid', () => {
  it('rows × cols 个 cell，行优先，格子等分', () => {
    const manifest = buildSheetManifest(input([habitGrid]));
    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets).toHaveLength(6);
    expect(targets.map((target) => target.targetId)).toEqual([
      'habits/r1c1',
      'habits/r1c2',
      'habits/r1c3',
      'habits/r2c1',
      'habits/r2c2',
      'habits/r2c3',
    ]);
    // checkboxGrid 没有 bind，坐标之外不猜数据归属。
    expect(targets.map((target) => target.payload)).toEqual(Array(6).fill(null));
    const first = targets[0];
    const second = targets[1];
    if (first === undefined || second === undefined) throw new Error('格子不足');
    expect(first.rect.w).toBeCloseTo(second.rect.w);
    // 3 列 → 每格占内容宽的 1/3；2 行、行高 7mm + 8mm 内边距 → 每行 11mm。
    expect(first.rect.w).toBeCloseTo((148 - 16) / 3 / 148);
    expect(first.rect.h).toBeCloseTo((8 + 2 * 7) / 2 / 210);
    expect(new Set(targets.map((target) => target.kind))).toEqual(new Set(['cell']));
  });
});

describe('坐标注册表：分页与跳过', () => {
  it('两页时第二页坐标仍是整页坐标，不是"本页相对"', () => {
    // A4 内容高 281mm；rows=39 的清单正好占满一页（8 + 39×7 = 281），第二块必然落到第二页。
    const blocks = [taskList(39, 'first'), taskList(2, 'second')];
    const manifest = buildSheetManifest(input(blocks, { paper: 'A4' }));
    expect(manifest.pages).toHaveLength(2);

    const secondPage = manifest.pages[1];
    const target = secondPage?.targets[0];
    expect(target?.targetId).toBe('second/r1');
    // 第二页仍然从整页左上角 + 页边距算起：8mm / 297mm。
    expect(target?.rect.y).toBeCloseTo(8 / 297);
    expect(target?.rect.x).toBeCloseTo(8 / 210);
  });

  it('不认识的 kind 不产生 target；rows 为 0 也不产生', () => {
    const timeLog: TimeLogBlock = {
      id: 'am',
      kind: 'timeLog',
      span: 12,
      dayPart: 'morning',
      rows: 2,
      label: '上午',
    };
    const blocks: Block[] = [
      { id: 'title', kind: 'title', span: 12, text: '3 月 5 日', align: 'left' },
      timeLog,
      { id: 'slots', kind: 'slots', span: 12, labels: ['睡眠', '心情', '专注'] },
      { id: 'notes', kind: 'linedBox', span: 12, label: '随手记', lines: 3 },
      { id: 'pb', kind: 'pageBreak', span: 12 },
      taskList(0, 'empty'),
    ];
    const manifest = buildSheetManifest(input(blocks));
    expect(manifest.pages.flatMap((page) => page.targets)).toEqual([]);
  });

  it('注册表带版本、模板与日期，页面尺寸来自纸张', () => {
    const manifest = buildSheetManifest(input([taskList(1)]));
    expect(manifest.version).toBe(1);
    expect(manifest.templateId).toBe('day');
    expect(manifest.date).toBe('2026-03-05');
    expect(manifest.paper).toBe('A5');
    expect(manifest.pages[0]?.widthMm).toBe(148);
    expect(manifest.pages[0]?.heightMm).toBe(210);
  });
});

describe('坐标注册表：habitRow 多行', () => {
  const habitRow = (rows: number): Block => ({ id: 'habits', kind: 'habitRow', span: 12, rows });

  it('7 项换 2 行（4+3），采样窗只覆盖 5mm 勾选框并按行下移', () => {
    const habits = ['早读', '背单词', '错题', '跑步', '练字', '日记', '复盘'];
    const blocks = [habitRow(2)];
    const manifest = buildSheetManifest(
      input(blocks, {
        bindings: { 'habits.today': habits.map((_, index) => `h${index + 1}`) },
        labels: { 'habits.today': habits },
      }),
    );
    const page = layout(blocks, { paper: 'A5' }).pages[0];
    if (page === undefined) throw new Error('缺少页面');
    const placement = page.placements[0];
    if (placement === undefined) throw new Error('缺少 placement');

    const targets = manifest.pages[0]?.targets ?? [];
    expect(targets).toHaveLength(7);
    expect(targets.map((target) => target.label)).toEqual(habits);
    expect(targets.map((target) => target.payload)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'h7',
    ]);

    // 第 1 行 4 格等宽；第 2 行 3 格等宽（比第 1 行宽）。
    const firstRowWidth = placement.widthMm / 4;
    const secondRowWidth = placement.widthMm / 3;
    expect((targets[0]?.rect.w ?? 0) * page.widthMm).toBeCloseTo(Math.min(5, firstRowWidth), 5);
    expect((targets[4]?.rect.w ?? 0) * page.widthMm).toBeCloseTo(Math.min(5, secondRowWidth), 5);
    expect((targets[4]?.rect.x ?? 0) * page.widthMm).toBeCloseTo(placement.xMm, 5);
    // 第 2 行相对块顶下移一个行高（7mm），不能还落在第 1 行。
    expect((targets[4]?.rect.y ?? 0) * page.heightMm).toBeCloseTo(placement.yMm + 7, 5);
    // 同一行第 2 格横向偏移 = 第 1 行的格子宽。
    expect((targets[1]?.rect.x ?? 0) * page.widthMm).toBeCloseTo(placement.xMm + firstRowWidth, 5);
  });

  it('没有打卡项时不产生采样点', () => {
    const manifest = buildSheetManifest(input([habitRow(1)], { bindings: { 'habits.today': [] } }));
    expect(manifest.pages.flatMap((page) => page.targets)).toEqual([]);
  });
});

describe('坐标注册表：区块小定位点', () => {
  it('每个区块记录两个对角小点（归一化），targets 带 blockId', () => {
    const blocks: Block[] = [
      { id: 'title', kind: 'title', span: 12, text: '3 月 5 日', align: 'left' },
      taskList(2),
    ];
    const manifest = buildSheetManifest(input(blocks));
    const page = layout(blocks, { paper: 'A5' }).pages[0];
    if (page === undefined) throw new Error('缺少页面');
    const manifestPage = manifest.pages[0];
    if (manifestPage === undefined) throw new Error('清单缺页');

    expect(manifestPage.blocks).toHaveLength(2);
    const taskBlock = manifestPage.blocks?.find((block) => block.id === 'tasks');
    if (taskBlock === undefined) throw new Error('缺少作业区块');
    expect(taskBlock.x).toBeGreaterThanOrEqual(0);
    expect(taskBlock.w).toBeGreaterThan(0);

    // 上点 = 块顶上方 1mm、左 1/4；下点 = 块底下方 1mm、右 3/4。
    const placement = page.placements.find((item) => item.block.id === 'tasks');
    if (placement === undefined) throw new Error('缺少 placement');
    const topExpected = {
      x: (placement.xMm + placement.widthMm * 0.05) / page.widthMm,
      y: (placement.yMm - 1) / page.heightMm,
    };
    const bottomExpected = {
      x: (placement.xMm + placement.widthMm * 0.95) / page.widthMm,
      y: (placement.yMm + placement.heightMm + 1) / page.heightMm,
    };
    expect(taskBlock.marks.top.x).toBeCloseTo(topExpected.x, 6);
    expect(taskBlock.marks.top.y).toBeCloseTo(topExpected.y, 6);
    expect(taskBlock.marks.bottom.x).toBeCloseTo(bottomExpected.x, 6);
    expect(taskBlock.marks.bottom.y).toBeCloseTo(bottomExpected.y, 6);

    const taskTargets = manifestPage.targets.filter((target) => target.blockId === 'tasks');
    expect(taskTargets).toHaveLength(2);
    // 纯印刷区块没有 target，但仍有定位点，供扫描端校正局部坐标。
    expect(manifestPage.targets.every((target) => target.blockId !== undefined)).toBe(true);
  });
});

describe('坐标注册表：下方定位点几何', () => {
  it('每页记录打印时的底部定位点顶部纵坐标；内容短时跟着条码上移', () => {
    const blocks: Block[] = [taskList(1)];
    const manifest = buildSheetManifest(input(blocks));
    const page = layout(blocks, { paper: 'A5' }).pages[0];
    if (page === undefined) throw new Error('缺少页面');
    const contentBottom = Math.max(
      ...page.placements.map((placement) => placement.yMm + placement.heightMm),
    );
    const expected = fiducialBottomTopMm(contentBottom, page.heightMm);
    expect(manifest.pages[0]?.fiducialBottomTopMm).toBe(expected);
    // 内容只有一行时远高于页脚安全线（A5 约 202mm），说明它跟着条码/正文走。
    expect(expected).toBeCloseTo(contentBottom + 1, 6);
  });
});
