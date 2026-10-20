/**
 * 打印模板：把「纸上印什么」从 UI 里抽出来，变成 core 里的声明式数据。
 *
 * 为什么放在 core：
 * - 模板是产品规格（ROADMAP P1-C 1.10），不是某个宿主的渲染细节；
 * - 声明式数据能在测试里直接排版校验，一页放不下在 CI 就会红；
 * - Web / 桌面 / 未来的移动端共用同一份模板，不会各自漂移。
 *
 * 本文件只描述版式，不做渲染：宿主负责把 `Block` 映射成 DOM/CSS。
 * 行数等随纸张变化的部分由 `materialize()` 决定；模板常量本身永远不被修改。
 *
 * ## 校准页现在能做到什么、缺什么
 *
 * `CALIBRATION_TEMPLATE` 只用现有 `Block` 类型实现，因此：
 * - ✅ 页边距 / 整体缩放：标题与提示行 + linedBox 的边框位置可以肉眼判断；
 * - ✅ 粗刻度：`ROW_HEIGHT_MM`（7mm）的行高，用「10mm」…「50mm」标签近似；
 * - ✅ 版本与日期占位：`footer`；
 * - ❌ **精确毫米刻度尺：需要新增 `ruler` block**（固定 1mm 主刻度 / 5mm 次刻度线）。
 *      现有 Block 都表达不了「绝对毫米刻度」，本次只能用 linedBox 近似；
 * - ❌ 四角定位标 / 裁切标记：需要 `fiducials` / `cornerMarks` 之类的 block；
 * - ❌ 整页边框：现有块只能各自画框，画不出一圈连续外框。
 *
 * 结论：校准页目前只能验证「内容有没有被整体缩放/裁掉」，
 * 量不出「偏差了几毫米」。要达到 P1-12 的验收标准，必须先扩展 `blocks.ts`
 * （共享文件，本次不改）。
 */

import type { Block, TitleBlock } from './blocks.ts';
import { HABIT_ROW_MAX } from './blocks.ts';
import { type Margin, PAPER_SIZES, type PaperId } from './paper.ts';

export interface PrintTemplate {
  id: string;
  name: string;
  paper: PaperId;
  margin?: Margin;
  /** 区块模板；行数等随纸张自适应的部分在 materialize 里决定。 */
  blocks: Block[];
}

/** 书写提示的默认文案，与 `config.print.hintLine` 的默认值一致。 */
const DEFAULT_HINT = '深色笔 · 不出框 · 不连笔';

/**
 * 标题区块的文案留空。
 * 日期是打印时才知道的，模板里写死某一天会让常量被误当成「今天」。
 * `materialize()` 用 `context.dateLabel` 填进去。
 */
function dateTitle(align: 'left' | 'center'): TitleBlock {
  return { id: 'title', kind: 'title', span: 12, text: '', align };
}

/** 整行书写提示。 */
function hint(text: string): Block {
  return { id: 'hint', kind: 'hintLine', span: 12, text };
}

/** 整行手写留白区；模板只需要关心标签与行数。 */
function linedBox(id: string, label: string, lines: number): Block {
  return { id, kind: 'linedBox', span: 12, label, lines };
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

/**
 * 内置模板。
 *
 * 这里的行数写的是 **A4 完整版**；更小的纸张由 `materialize()` 换成精简版
 * （day：清单 10→4、时间登记 2→1；week：每天 3→2 行）。
 * 其余模板的区块数不随纸张变化，只是行高不变、页边距让内容更紧凑。
 */
export const BUILTIN_TEMPLATES: PrintTemplate[] = [
  {
    id: 'day',
    name: '我的一天',
    paper: 'A4',
    blocks: [
      // 标题让出右边 3 列给二维码：二维码不占独立一行，A4 才装得下。
      { ...dateTitle('left'), span: 9 },
      // 回填二维码：写死「模板 + 日期 + 纸张」，扫描时据此找回坐标清单（DESIGN §16）。
      { id: 'qr', kind: 'qrcode', span: 3, sizeMm: 16 },
      {
        id: 'tasks',
        kind: 'checkboxList',
        span: 12,
        bind: 'tasks.today',
        rows: 9,
        showMeta: [],
      },
      // 当日课表排在清单之后：学生先看"今天有什么课"，再对照作业
      { id: 'schedule', kind: 'schedule', span: 12, rows: 7, title: '今日课表' },
      { id: 'am', kind: 'timeLog', span: 12, dayPart: 'morning', rows: 2, label: '上午' },
      { id: 'pm', kind: 'timeLog', span: 12, dayPart: 'afternoon', rows: 2, label: '下午' },
      { id: 'ev', kind: 'timeLog', span: 12, dayPart: 'evening', rows: 2, label: '晚上' },
      // 三格自评印成 1–5 的勾选格：手写数字读不回来（DESIGN §16.3）。
      {
        id: 'rating',
        kind: 'ratingGrid',
        span: 12,
        labels: ['睡眠', '心情', '专注'],
        keys: ['sleep', 'mood', 'focus'],
        scale: 5,
      },
      // 打卡行：一天有几个习惯就印几个勾选框；扫描按坐标回填到 habits。
      { id: 'habits', kind: 'habitRow', span: 12 },
      hint(DEFAULT_HINT),
    ],
  },
  {
    id: 'week',
    name: '本周计划',
    paper: 'A4',
    blocks: [
      dateTitle('left'),
      ...WEEKDAY_LABELS.map((label, index) => linedBox(`day-${index + 1}`, label, 3)),
      hint('周日晚上回看一遍，下周只改一处'),
    ],
  },
  {
    id: 'checkin',
    name: '打卡卡',
    paper: 'A5',
    blocks: [
      dateTitle('center'),
      { id: 'grid', kind: 'checkboxGrid', span: 12, cols: 7, rows: 3 },
      hint('做到了就打勾，没做到就留空'),
    ],
  },
  {
    id: 'index-card',
    name: '口袋卡',
    paper: 'index-card',
    blocks: [
      linedBox('formula', '公式', 3),
      linedBox('words', '单词', 3),
      linedBox('todos', '待办', 3),
    ],
  },
  {
    id: 'countdown',
    name: '考试倒计时牌',
    paper: 'A4',
    blocks: [
      dateTitle('center'),
      { id: 'dots', kind: 'progressDots', span: 12, total: 100 },
      linedBox('days', '距考试还有 ____ 天', 1),
      hint('每天只写一个数字，划掉昨天'),
    ],
  },
];

/** 校准页的近似刻度：每格 label 对应一行的 7mm 行高，不是精确毫米尺。 */
const CALIBRATION_MARKS = ['10mm', '20mm', '30mm', '40mm', '50mm'] as const;

/**
 * 打印校准页（P1-12）：用于确认打印机缩放、边距与裁切。
 *
 * 校准页是静态版式，不随日期变化，所以标题写死、不走 `materialize()` 的日期填充。
 * 局限见文件顶部注释：精确刻度尺 / 四角标记 / 整页边框需要新的 Block 类型。
 */
export const CALIBRATION_TEMPLATE: PrintTemplate = {
  id: 'calibration',
  name: '打印校准页',
  paper: 'A4',
  blocks: [
    {
      id: 'title',
      kind: 'title',
      span: 12,
      text: '打印校准页 · 请用实际大小（100%）打印',
      align: 'center',
    },
    hint('下边框应与纸边距对齐；四角标记应完整不裁切'),
    ...CALIBRATION_MARKS.map((mark) => linedBox(`scale-${mark}`, mark, 1)),
    {
      id: 'footer',
      kind: 'footer',
      span: 12,
      text: 'GoFor 打印校准 v1 · 日期 ____',
    },
  ],
};

/** 深拷贝区块；数组字段单独复制，避免复用模板的常量数组。 */
function cloneBlock(block: Block): Block {
  switch (block.kind) {
    case 'checkboxList':
      return { ...block, showMeta: [...block.showMeta] };
    case 'table':
      return { ...block, headers: [...block.headers] };
    case 'slots':
      return { ...block, labels: [...block.labels] };
    case 'ratingGrid':
      // labels 与 keys 都是数组：浅拷贝会让"改返回值"污染内置模板（已有测试钉住这一点）。
      return {
        ...block,
        labels: [...block.labels],
        ...(block.keys === undefined ? {} : { keys: [...block.keys] }),
      };
    default: {
      const copy: Block = { ...block };
      return copy;
    }
  }
}

/** A4 是唯一的「完整版」档位；A5 / 索引卡 / 标签都用精简版。 */
function isFullDensity(paper: PaperId): boolean {
  return paper === 'A4';
}

/** 按模板与纸张调整行数；返回新对象，未调整的块原样返回（由 cloneBlock 复制）。 */
function adaptBlock(block: Block, templateId: string, full: boolean): Block {
  if (templateId === 'day') {
    switch (block.kind) {
      case 'checkboxList':
        return { ...block, rows: full ? 8 : 4 };
      case 'timeLog':
        return { ...block, rows: full ? 2 : 1 };
      case 'schedule':
        // A4 完整版留 6 节 + 二维码 + 三格自评仍能一页（267/281mm）；
        // A5 只留 4 节，否则整体超过 194mm 可用高度。
        return { ...block, rows: full ? 6 : 4 };
      default:
        return block;
    }
  }

  if (templateId === 'week' && block.kind === 'linedBox') {
    // A5 用 3 行/天会超过 194mm 的可用高度（≈235mm），精简到 2 行。
    return { ...block, lines: full ? 3 : 2 };
  }

  return block;
}

function adaptBlocks(template: PrintTemplate, paper: PaperId): Block[] {
  const full = isFullDensity(paper);
  return template.blocks
    .map((block) => cloneBlock(adaptBlock(block, template.id, full)))
    .filter((block) => {
      // 「我的一天」在 A5 已经顶满 202mm 可用高度，再塞 7mm 打卡行会翻页；
      // 高度 < 230mm 的小纸（A5/A6/索引卡）上不显示打卡行；A4/B5/Letter 保留。
      const smallPaper = (PAPER_SIZES[paper]?.heightMm ?? 0) < 230;
      if (template.id === 'day' && smallPaper && block.kind === 'habitRow') return false;
      return true;
    });
}

/**
 * 按纸张与日期把模板填充成可直接 `layout()` 的区块列表。
 *
 * - 行数由 `template.paper` 决定（A4 完整版 / 其余精简版）；
 * - `title` 文案为空时填入 `context.dateLabel`；已有固定文案（校准页）则保留；
 * - `habitRow` 的行数由 `context.habitCount` 决定（打卡项多就换行，不截断）；
 *   换行多占的高度从「我的一天」的作业清单行里让出来（至少保留 4 行），
 *   否则 A4 一天会从 1 页变成 2 页——纸是主输入端，多一页就是多一张纸；
 * - 返回全新的 Block 数组，**不修改** `template.blocks`，模板可被反复复用。
 */
export function materialize(
  template: PrintTemplate,
  context: { date: string; dateLabel: string; habitCount?: number },
): Block[] {
  const blocks = adaptBlocks(template, template.paper).map((block) => {
    if (block.kind === 'habitRow' && context.habitCount !== undefined) {
      // 空状态也占一行占位；每行最多 HABIT_ROW_MAX 个。
      return { ...block, rows: Math.max(1, Math.ceil(context.habitCount / HABIT_ROW_MAX)) };
    }
    if (block.kind !== 'title' || block.text !== '') return block;
    return { ...block, text: context.dateLabel };
  });

  if (template.id !== 'day' || context.habitCount === undefined) return blocks;
  const habitRows = Math.max(1, Math.ceil(context.habitCount / HABIT_ROW_MAX));
  const extraRows = habitRows - 1;
  // A5 等小纸本来就不印打卡行（adaptBlocks 已过滤），没有要腾的空间。
  if (extraRows <= 0 || !blocks.some((block) => block.kind === 'habitRow')) return blocks;

  // 只让第一个 checkboxList（一天的作业清单）让位；保留 4 行，再多就让纸翻页。
  let shrunk = false;
  return blocks.map((block) => {
    if (shrunk || block.kind !== 'checkboxList') return block;
    shrunk = true;
    return { ...block, rows: Math.max(4, block.rows - extraRows) };
  });
}

/**
 * 取指定模板在指定纸张下的版本（A4 完整版 / A5 精简版）。
 *
 * 返回的模板 `blocks` 已经按纸张调好行数，可以直接 `materialize()`，
 * 也可以给模板编辑器做「切纸张实时预览」。
 * 未知模板 id 抛错：静默回退到别的模板会让人打错版面。
 */
export function paperFor(templateId: string, paper: PaperId): PrintTemplate {
  const template = [...BUILTIN_TEMPLATES, CALIBRATION_TEMPLATE].find(
    (candidate) => candidate.id === templateId,
  );
  if (!template) throw new Error(`未知打印模板：${templateId}`);
  return { ...template, paper, blocks: adaptBlocks(template, paper) };
}
