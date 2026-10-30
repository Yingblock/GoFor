/**
 * 语义化版本的极小子集。
 *
 * 为什么不用现成库（semver）：这里只需要「声明依赖范围 + 判断宿主/依赖是否兼容」，
 * 用不到 pre-release 的优先级规则、build metadata 比较、`||` 集合。为一个
 * 30 行的判断引入 30KB 依赖不值得（`docs/STANDARD.md` 规则 10），但**必须**有测试，
 * 因为范围判断写错会让插件"看起来装了、其实没启用"。
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(input.trim());
  if (!match) return null;
  const parsed: ParsedVersion = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? '',
  };
  if (![parsed.major, parsed.minor, parsed.patch].every(Number.isSafeInteger)) return null;
  return parsed;
}

/** 比较两个版本：a<b 返回 -1，相等 0，a>b 返回 1；任一非法返回 null。 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  // 预发布版本排在同版本正式版之前（`1.0.0-beta` < `1.0.0`）。
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === '') return 1;
  if (right.prerelease === '') return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

/**
 * 范围语法（够用就好）：
 * - `*` / 空串：任意
 * - `1.2.3` / `=1.2.3`：精确
 * - `^1.2.3`：兼容主版本（0.x 时兼容次版本）
 * - `~1.2.3`：兼容次版本
 * - `>=1.2.3`、`>1.2.3`、`<=1.2.3`、`<1.2.3`
 * - 多个比较符用空格或逗号连接，表示**同时满足**
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const spec = range.trim();
  if (spec === '' || spec === '*') return true;
  if (parseVersion(version) === null) return false;

  const comparators = spec.split(/[\s,]+/).filter(Boolean);
  if (comparators.length === 0) return true;

  return comparators.every((comparator) => satisfiesComparator(version, comparator));
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(comparator);
  if (!match) return false;
  const operator = match[1] ?? '=';
  const target = match[2] ?? '';
  const base = parseVersion(target);
  if (!base) return false;

  const order = compareVersions(version, target);
  if (order === null) return false;

  switch (operator) {
    case '=':
      return order === 0;
    case '>=':
      return order >= 0;
    case '>':
      return order > 0;
    case '<=':
      return order <= 0;
    case '<':
      return order < 0;
    case '^': {
      if (order < 0) return false;
      const upper = base.major > 0 ? `${base.major + 1}.0.0` : `0.${base.minor + 1}.0`;
      return (compareVersions(version, upper) ?? 1) < 0;
    }
    case '~': {
      if (order < 0) return false;
      return (compareVersions(version, `${base.major}.${base.minor + 1}.0`) ?? 1) < 0;
    }
    default:
      return false;
  }
}

/**
 * 只校验范围**语法**（不判断某个具体版本是否满足）。
 * manifest 校验用：依赖声明写错时应该在安装页报错，而不是等到激活才发现。
 */
export function isValidVersionRange(range: string): boolean {
  const spec = range.trim();
  if (spec === '' || spec === '*') return true;
  const tokens = spec.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => {
    const match = /^(\^|~|>=|<=|>|<|=)?\s*(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(token);
    return match !== null && parseVersion(match[2] ?? '') !== null;
  });
}
