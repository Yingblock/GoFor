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
 * 打印模板现在全部由插件注册；本文件只保留类型/materialize/layout，不再内置模板。

校准页由插件注册（使用现有 `Block` 类型实现），因此：
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

import type { Block } from './blocks.ts';
import { HABIT_ROW_MAX } from './blocks.ts';
import { type Margin, PAPER_SIZES, type PaperId } from './paper.ts';

export interface PrintTemplate {
  id: string;
  name: string;
  paper: PaperId;
  /** 纸张密度策略：day 会压缩作业/课表，week 会压缩手写行；未知/静态模板不压缩。 */
  density?: 'day' | 'week';
  margin?: Margin;
  /** 区块模板；行数等随纸张自适应的部分在 materialize 里决定。 */
  blocks: Block[];
}

/** 书写提示的默认文案，与 `config.print.hintLine` 的默认值一致。 */
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
function adaptBlock(block: Block, template: PrintTemplate, full: boolean): Block {
  if (template.density === 'day') {
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

  if (template.density === 'week' && block.kind === 'linedBox') {
    // A5 用 3 行/天会超过 194mm 的可用高度（≈235mm），精简到 2 行。
    return { ...block, lines: full ? 3 : 2 };
  }

  return block;
}

function adaptBlocks(template: PrintTemplate, paper: PaperId): Block[] {
  const full = isFullDensity(paper);
  return template.blocks
    .map((block) => cloneBlock(adaptBlock(block, template, full)))
    .filter((block) => {
      // 「我的一天」在 A5 已经顶满 202mm 可用高度，再塞 7mm 打卡行会翻页；
      // 高度 < 230mm 的小纸（A5/A6/索引卡）上不显示打卡行；A4/B5/Letter 保留。
      const smallPaper = (PAPER_SIZES[paper]?.heightMm ?? 0) < 230;
      if (template.density === 'day' && smallPaper && block.kind === 'habitRow') return false;
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

  if (template.density !== 'day' || context.habitCount === undefined) return blocks;
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
export function paperForTemplate(template: PrintTemplate, paper: PaperId): PrintTemplate {
  return { ...template, paper, blocks: adaptBlocks(template, paper) };
}


