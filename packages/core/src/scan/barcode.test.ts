import { describe, expect, it } from 'vitest';
import { PAPER_IDS } from '../print/paper.ts';
import {
  CODE128_PATTERNS,
  decodeCode128Row,
  encodeCode128,
  encodeSheetCode,
  parseSheetCode,
  type SheetCode,
  sheetCodeToken,
} from './barcode.ts';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** 确定性伪随机（测试必须可复现，不能用 Math.random）。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 10 组往返用的随机可打印 ASCII（32..126，正好是 Code Set B 的范围）。 */
function randomText(rand: () => number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) text += String.fromCharCode(32 + Math.floor(rand() * 95));
  return text;
}

function blackWhite(modules: readonly boolean[]): number[] {
  return modules.map((black) => (black ? 1 : 0));
}

/** 整数倍放大：每个模块占 `scale` 个像素。 */
function rasterize(modules: readonly boolean[], scale: number): number[] {
  const row: number[] = [];
  for (const black of modules) {
    for (let i = 0; i < scale; i++) row.push(black ? 1 : 0);
  }
  return row;
}

/** 按累积像素坐标展开，允许非整数倍（scale = 3.7 时模块宽 3/4 像素交替）。 */
function rasterizeScaled(modules: readonly boolean[], scale: number): number[] {
  const row: number[] = [];
  for (let i = 0; i < modules.length; i++) {
    const start = Math.round(i * scale);
    const end = Math.round((i + 1) * scale);
    const pixel = modules[i] ? 1 : 0;
    for (let p = start; p < end; p++) row.push(pixel);
  }
  return row;
}

/** 每个模块宽度乘 1±0.2 的随机系数，再按累积像素取整。 */
function rasterizeJittered(
  modules: readonly boolean[],
  scale: number,
  rand: () => number,
): number[] {
  const row: number[] = [];
  let position = 0;
  for (const black of modules) {
    const width = scale * (1 + (rand() * 2 - 1) * 0.2);
    const end = position + width;
    const pixels = Math.round(end) - Math.round(position);
    for (let i = 0; i < pixels; i++) row.push(black ? 1 : 0);
    position = end;
  }
  return row;
}

function withWhiteMargin(row: readonly number[], margin: number): number[] {
  const white = new Array<number>(margin).fill(0);
  return [...white, ...row, ...white];
}

/** 按给定符号序列直接拼模块，用来独立验证编码器（不复用 encodeCode128）。 */
function modulesForSymbols(symbols: readonly number[]): boolean[] {
  const modules: boolean[] = [];
  let black = true;
  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol];
    if (pattern === undefined) throw new Error(`符号不存在：${symbol}`);
    for (const digit of pattern) {
      const width = Number(digit);
      for (let i = 0; i < width; i++) modules.push(black);
      black = !black;
    }
  }
  return modules;
}

function deterministicUuid(rand: () => number): string {
  const hex = (length: number): string => {
    let text = '';
    for (let i = 0; i < length; i++) text += '0123456789abcdef'.charAt(Math.floor(rand() * 16));
    return text;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

describe('Code 128 码表', () => {
  it('使用标准码表（golden）', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(CODE128_PATTERNS[0]).toBe('212222');
    expect(CODE128_PATTERNS[103]).toBe('211412');
    expect(CODE128_PATTERNS[104]).toBe('211214');
    expect(CODE128_PATTERNS[105]).toBe('211232');
    expect(CODE128_PATTERNS[106]).toBe('2331112');
  });

  it('普通符号 6 段 11 模块、终止符 7 段 13 模块，条宽和为偶数', () => {
    for (let value = 0; value < 106; value++) {
      const pattern = CODE128_PATTERNS[value];
      expect(pattern).toBeDefined();
      const widths = [...(pattern ?? '')].map(Number);
      expect(widths).toHaveLength(6);
      expect(widths.reduce((sum, width) => sum + width, 0)).toBe(11);
      const barWidth = widths
        .filter((_, index) => index % 2 === 0)
        .reduce((sum, width) => sum + width, 0);
      expect(barWidth % 2).toBe(0);
    }
    const stop = [...(CODE128_PATTERNS[106] ?? '')].map(Number);
    expect(stop).toHaveLength(7);
    expect(stop.reduce((sum, width) => sum + width, 0)).toBe(13);
    const stopBarWidth = stop
      .filter((_, index) => index % 2 === 0)
      .reduce((sum, width) => sum + width, 0);
    expect(stopBarWidth % 2).toBe(0);
  });
});

describe('encodeCode128', () => {
  it('长度 = 静区 20 + 11×(1 起始 + n 数据 + 1 校验) + 13 终止', () => {
    for (const dataLength of [0, 1, 5, 16, 40]) {
      const modules = encodeCode128('A'.repeat(dataLength));
      expect(modules).toHaveLength(20 + 11 * (dataLength + 2) + 13);
    }
  });

  it('前后各 10 个白模块静区，首尾都是条', () => {
    const modules = encodeCode128('A');
    expect(modules.slice(0, 10).every((black) => !black)).toBe(true);
    expect(modules.slice(-10).every((black) => !black)).toBe(true);
    expect(modules[10]).toBe(true);
    expect(modules[modules.length - 11]).toBe(true);
  });

  it('与独立拼出的标准符号一致（A → 104/33/34/106）', () => {
    const expected = modulesForSymbols([104, 33, 34, 106]);
    const quiet = new Array<boolean>(10).fill(false);
    expect(encodeCode128('A')).toEqual([...quiet, ...expected, ...quiet]);
  });

  it('Code Set B 之外的字符直接抛错', () => {
    expect(() => encodeCode128('中')).toThrow();
    expect(() => encodeCode128('\n')).toThrow();
    expect(() => encodeCode128('\u007f')).toThrow();
    expect(() => encodeCode128('😀')).toThrow();
  });
});

describe('编解码往返', () => {
  it('10 个随机字符串（含大小写/数字/符号，长度 1..40）', () => {
    const rand = mulberry32(0x5eed);
    for (let i = 0; i < 10; i++) {
      const text = randomText(rand, 1 + Math.floor(rand() * 40));
      expect(decodeCode128Row(blackWhite(encodeCode128(text)))).toBe(text);
    }
  });

  it('空文本也能往返', () => {
    expect(decodeCode128Row(blackWhite(encodeCode128('')))).toBe('');
  });
});

describe('栅格化容忍度', () => {
  const TEXT = 'Code 128 B!';

  it('整数倍 1..20 都能解（含规格点名的 1/2/3/5）', () => {
    const modules = encodeCode128(TEXT);
    for (let scale = 1; scale <= 20; scale++) {
      expect(decodeCode128Row(rasterize(modules, scale))).toBe(TEXT);
    }
  });

  it('非整数整体缩放 3.7 / 7.3 都能解', () => {
    const modules = encodeCode128(TEXT);
    for (const scale of [3.7, 7.3]) {
      expect(decodeCode128Row(rasterizeScaled(modules, scale))).toBe(TEXT);
    }
  });

  it('每个模块 ±20% 抖动、50 组随机种子全部成功', () => {
    const rand = mulberry32(0xbada55);
    for (let seed = 0; seed < 50; seed++) {
      const text = randomText(rand, 1 + Math.floor(rand() * 40));
      const row = rasterizeJittered(encodeCode128(text), 6, rand);
      expect(decodeCode128Row(row), `seed=${seed} text=${JSON.stringify(text)}`).toBe(text);
    }
  });

  it('整行上下颠倒（反转）也能解', () => {
    for (const scale of [1, 2, 3.7]) {
      const row = rasterizeScaled(encodeCode128('Reverse me 42!'), scale);
      expect(decodeCode128Row([...row].reverse())).toBe('Reverse me 42!');
    }
  });

  it('前后加 0..500 个白像素都能解', () => {
    const row = rasterize(encodeCode128('Margin test 9'), 2);
    for (const margin of [0, 1, 2, 7, 13, 50, 127, 256, 500]) {
      expect(decodeCode128Row(withWhiteMargin(row, margin))).toBe('Margin test 9');
    }
  });
});

describe('decodeCode128Row 的坏输入', () => {
  it('空行/全白/全黑/太短都返回 null，不抛错', () => {
    expect(decodeCode128Row([])).toBeNull();
    expect(decodeCode128Row([0, 0, 0, 0])).toBeNull();
    expect(decodeCode128Row(new Array<number>(64).fill(1))).toBeNull();
    expect(decodeCode128Row([1])).toBeNull();
    expect(decodeCode128Row([1, 0, 1, 0, 1, 0, 1])).toBeNull();
  });
});

describe('随机噪声拒绝', () => {
  it('2000 条随机黑白行全部返回 null', () => {
    const rand = mulberry32(0xdeadbeef);

    // 1000 条纯随机像素行。
    for (let i = 0; i < 1000; i++) {
      const length = 100 + Math.floor(rand() * 2000);
      const row = new Array<number>(length);
      for (let p = 0; p < length; p++) row[p] = rand() < 0.5 ? 1 : 0;
      expect(decodeCode128Row(row), `random row ${i}`).toBeNull();
    }

    // 1000 条随机 1–2 像素的"条空"序列。
    for (let i = 0; i < 1000; i++) {
      const row: number[] = [];
      const total = 200 + Math.floor(rand() * 2000);
      let black = rand() < 0.5;
      while (row.length < total) {
        const runLength = 1 + Math.floor(rand() * 2);
        for (let k = 0; k < runLength && row.length < total; k++) row.push(black ? 1 : 0);
        black = !black;
      }
      expect(decodeCode128Row(row), `run row ${i}`).toBeNull();
    }
  });
});

describe('sheetCodeToken', () => {
  it('golden：同一输入永远得到同一短码', () => {
    expect(sheetCodeToken('day')).toBe('j4y8fx');
    expect(sheetCodeToken('week')).toBe('awd5jx');
    expect(sheetCodeToken('month')).toBe('b7m1g5');
    expect(sheetCodeToken('数学 卷子')).toBe('zc5ks3');
    expect(sheetCodeToken('3f2a6c1e-9b4d-4a7f-8c2e-5d1b0a9e7f43')).toBe('g34cnw');
  });

  it('固定 6 字符、只用小写 base32 字母表', () => {
    const rand = mulberry32(1234);
    for (let i = 0; i < 50; i++) {
      const token = sheetCodeToken(`template-${i}-${randomText(rand, 8)}`);
      expect(token).toHaveLength(6);
      expect([...token].every((char) => ALPHABET.includes(char))).toBe(true);
    }
  });

  it('200 个 uuid 的短码互不碰撞', () => {
    const rand = mulberry32(0x9e3779b9);
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) tokens.add(sheetCodeToken(deterministicUuid(rand)));
    expect(tokens.size).toBe(200);
  });
});

describe('纸面短码载荷', () => {
  const BASE = { date: '2026-03-05', paper: 'A4', templateId: 'day', page: 3 } as const;

  it('格式固定 16 字符：G1 + YYMMDD + 纸张 + 模板短码 + 页号', () => {
    const encoded = encodeSheetCode(BASE);
    expect(encoded).toHaveLength(16);
    expect(encoded.slice(0, 2)).toBe('G1');
    expect(encoded.slice(2, 8)).toBe('260305');
    expect(encoded.slice(8, 9)).toBe(ALPHABET[0]);
    expect(encoded.slice(9, 15)).toBe(sheetCodeToken('day'));
    expect(encoded.slice(15)).toBe('3');
  });

  it('覆盖 PAPER_IDS 全部 9 种纸 × 页 1..9 的往返', () => {
    for (const paper of PAPER_IDS) {
      for (let page = 1; page <= 9; page++) {
        const encoded = encodeSheetCode({ ...BASE, paper, page });
        expect(parseSheetCode(encoded)).toEqual({
          date: BASE.date,
          paper,
          token: sheetCodeToken('day'),
          page,
        } satisfies SheetCode);
      }
    }
  });

  it('闰日也能往返', () => {
    const encoded = encodeSheetCode({ ...BASE, date: '2024-02-29' });
    expect(parseSheetCode(encoded)?.date).toBe('2024-02-29');
  });

  it('模板/日期/纸张/页不同，载荷也不同', () => {
    expect(encodeSheetCode(BASE)).not.toBe(encodeSheetCode({ ...BASE, templateId: 'week' }));
    expect(encodeSheetCode(BASE)).not.toBe(encodeSheetCode({ ...BASE, date: '2026-03-06' }));
    expect(encodeSheetCode(BASE)).not.toBe(encodeSheetCode({ ...BASE, paper: 'A5' }));
    expect(encodeSheetCode(BASE)).not.toBe(encodeSheetCode({ ...BASE, page: 4 }));
  });

  it('encode 对非法输入抛错（不印坏纸）', () => {
    expect(() => encodeSheetCode({ ...BASE, date: '2026-02-30' })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, date: '2026-13-01' })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, date: '1999-12-31' })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, paper: 'A3' })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, page: 0 })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, page: 10 })).toThrow();
    expect(() => encodeSheetCode({ ...BASE, page: 1.5 })).toThrow();
  });

  it('parse 对空/长度/前缀不对返回 null', () => {
    const valid = encodeSheetCode(BASE);
    expect(parseSheetCode('')).toBeNull();
    expect(parseSheetCode(valid.slice(0, 15))).toBeNull();
    expect(parseSheetCode(`${valid}0`)).toBeNull();
    expect(parseSheetCode(`g1${valid.slice(2)}`)).toBeNull();
    expect(parseSheetCode(`X1${valid.slice(2)}`)).toBeNull();
  });

  it('parse 对不存在的日期返回 null', () => {
    const valid = encodeSheetCode(BASE);
    expect(parseSheetCode(`${valid.slice(0, 2)}260230${valid.slice(8)}`)).toBeNull();
    expect(parseSheetCode(`${valid.slice(0, 2)}261301${valid.slice(8)}`)).toBeNull();
    expect(parseSheetCode(`${valid.slice(0, 2)}260000${valid.slice(8)}`)).toBeNull();
  });

  it('parse 对页号 0/非数字返回 null', () => {
    const valid = encodeSheetCode(BASE);
    expect(parseSheetCode(`${valid.slice(0, 15)}0`)).toBeNull();
    expect(parseSheetCode(`${valid.slice(0, 15)}a`)).toBeNull();
  });

  it('parse 对未知纸张返回 null', () => {
    const valid = encodeSheetCode(BASE);
    // 字母表下标 9..31 没有对应纸张。
    expect(parseSheetCode(`${valid.slice(0, 8)}z${valid.slice(9)}`)).toBeNull();
  });

  it('parse 对非 base32 字符返回 null', () => {
    const valid = encodeSheetCode(BASE);
    for (const bad of ['i', 'l', 'o', 'u', 'A', '-']) {
      expect(parseSheetCode(`${valid.slice(0, 9)}${bad}${valid.slice(10)}`)).toBeNull();
    }
  });
});
