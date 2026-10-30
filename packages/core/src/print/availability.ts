import { BLOCK_KINDS, type Block, type BlockKind } from './blocks.ts';

/**
 * 打印区块的归属与可用性（P3.5）。
 *
 * 纸面几何继续归 core；插件只声明"这个 kind 归我"。插件被禁用/卸载后，
 * 它拥有的区块在预览与打印里**静默跳过**（不画空框、不打印），并由上层在
 * 预览下方给出「缺失 XX 插件」的警告。
 *
 * 为什么跳过而不是画占位：纸是给手写的，画一个"填了也没人处理"的格子
 * 比纸短一点更糟；但必须让用户知道少了什么，所以警告不能省。
 */
export interface PrintBlockOwnerRule {
  kind: string;
  pluginId: string;
  name: string;
  enabled: boolean;
}

export interface PrintBlockMissing {
  pluginId: string;
  name: string;
  count: number;
}

export interface PrintBlockAvailability {
  /** 可以真正渲染/打印的区块。 */
  blocks: Block[];
  /** block.id → owner pluginId，用于写进坐标清单。 */
  owners: Record<string, string>;
  /** 预览下方展示的警告（已按插件/未知 kind 去重）。 */
  warnings: string[];
  missing: PrintBlockMissing[];
  /** 模板里出现了宿主不认识的 kind（多半来自旧/外部模板）。 */
  unknownKinds: string[];
}

/**
 * 过滤区块并生成警告。
 *
 * 规则：
 * 1. kind 不在 `BLOCK_KINDS` 里 → 跳过（未知区块，任何插件都渲染不了）；
 * 2. kind 有 owner 且 owner 插件未启用 → 跳过并记入 missing；
 * 3. 其余保留；有 owner 的记进 `owners`（供 manifest 路由回填）。
 */
export function resolvePrintBlocks(
  blocks: readonly Block[],
  rules: readonly PrintBlockOwnerRule[],
): PrintBlockAvailability {
  const ruleByKind = new Map<string, PrintBlockOwnerRule>();
  for (const rule of rules) {
    // 同一个 kind 被两个插件声明时保留第一个；冲突由宿主在安装页报告。
    if (!ruleByKind.has(rule.kind)) ruleByKind.set(rule.kind, rule);
  }

  const knownKinds = new Set<string>(BLOCK_KINDS);
  const kept: Block[] = [];
  const owners: Record<string, string> = {};
  const missing = new Map<string, PrintBlockMissing>();
  const missingKinds = new Map<string, string[]>();
  const unknownKinds = new Set<string>();

  for (const block of blocks) {
    const kind = block.kind as string;
    if (!knownKinds.has(kind)) {
      unknownKinds.add(kind);
      continue;
    }
    const rule = ruleByKind.get(kind);
    if (rule && !rule.enabled) {
      const current = missing.get(rule.pluginId);
      if (current) current.count += 1;
      else missing.set(rule.pluginId, { pluginId: rule.pluginId, name: rule.name, count: 1 });
      const kinds = missingKinds.get(rule.pluginId) ?? [];
      if (!kinds.includes(kind)) kinds.push(kind);
      missingKinds.set(rule.pluginId, kinds);
      continue;
    }
    kept.push(block);
    if (rule) owners[block.id] = rule.pluginId;
  }

  const missingList = [...missing.values()].sort((a, b) => b.count - a.count);
  const warnings: string[] = missingList.map((entry) => {
    const kinds = missingKinds.get(entry.pluginId) ?? [];
    return `缺失「${entry.name}」插件：${entry.count} 个区块已跳过（${kinds.join('、')}）`;
  });
  for (const kind of unknownKinds) {
    warnings.push(`缺失插件：无法渲染的区块「${kind}」已跳过`);
  }

  return {
    blocks: kept,
    owners,
    warnings,
    missing: missingList,
    unknownKinds: [...unknownKinds].sort(),
  };
}

/** 给 UI 的 kind 中文名；未知时原样返回。 */
export function blockKindLabel(kind: string): string {
  const labels: Record<BlockKind, string> = {
    title: '标题',
    checkboxList: '作业清单',
    timeLog: '时间登记',
    schedule: '课表',
    timestamp: '时间戳',
    checkboxGrid: '勾选格',
    ratingGrid: '三格自评',
    table: '表格',
    slots: '手写格',
    linedBox: '手写区',
    hintLine: '书写提示',
    qrcode: '二维码',
    habitRow: '打卡行',
    progressDots: '进度点',
    footer: '页脚',
    pageBreak: '分页',
  };
  return labels[kind as BlockKind] ?? kind;
}

/** 某个区块 kind 当前是否可加/可渲染：未知 kind 或 owner 插件禁用时不可用。 */
export function isPrintBlockKindAvailable(
  kind: string,
  rules: readonly PrintBlockOwnerRule[],
): boolean {
  if (!(BLOCK_KINDS as readonly string[]).includes(kind)) return false;
  const rule = rules.find((entry) => entry.kind === kind);
  return rule === undefined || rule.enabled;
}
