import { describe, expect, it } from 'vitest';
import { normalizeWidth, parseTimeOfDay, parseTimeRange } from './timeRange.js';

/** 取出成功结果，断言方便。 */
function range(raw: string, dayPart?: 'morning' | 'afternoon' | 'evening') {
  const result = dayPart ? parseTimeRange(raw, { dayPart }) : parseTimeRange(raw);
  if (!result.ok) throw new Error(`解析失败：${result.error}`);
  return result.value;
}

describe('纸面时间：归一化', () => {
  it('全角数字与标点转半角', () => {
    expect(normalizeWidth('１９：３０～２０：１５')).toBe('19:30~20:15');
  });
});

describe('纸面时间：单点解析', () => {
  it('冒号 / 点 / 点字 / 时分字 都认', () => {
    for (const raw of ['19:30', '19.30', '19点30', '19时30分', '1930']) {
      expect(parseTimeOfDay(raw)).toBe(19 * 60 + 30);
    }
  });

  it('只有小时时按整点', () => {
    expect(parseTimeOfDay('19点')).toBe(19 * 60);
  });

  it('拒绝越界', () => {
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('19:75')).toBeNull();
    expect(parseTimeOfDay('abc')).toBeNull();
  });
});

describe('纸面时间：用版面消除 7:30 的歧义', () => {
  it('晚上栏的 7:30 补成 19:30', () => {
    expect(parseTimeOfDay('7:30', 'evening')).toBe(19 * 60 + 30);
  });

  it('上午栏的 7:30 保持 07:30', () => {
    expect(parseTimeOfDay('7:30', 'morning')).toBe(7 * 60 + 30);
  });

  it('下午栏的 2:00 补成 14:00', () => {
    expect(parseTimeOfDay('2:00', 'afternoon')).toBe(14 * 60);
  });

  it('已经写成 19:30 的不再叠加', () => {
    expect(parseTimeOfDay('19:30', 'evening')).toBe(19 * 60 + 30);
  });
});

describe('纸面时间：区间解析', () => {
  it('多种分隔符', () => {
    for (const raw of ['19:30-20:15', '19:30~20:15', '19:30到20:15', '19:30 至 20:15']) {
      const value = range(raw);
      expect(value.start).toBe(1170);
      expect(value.end).toBe(1215);
    }
  });

  it('跨零点不报错', () => {
    const value = range('23:30-0:30');
    expect(value.start).toBe(1410);
    expect(value.end).toBe(1470);
  });

  it('只写开始时间时 end 为 null', () => {
    const value = range('19:30');
    expect(value.start).toBe(1170);
    expect(value.end).toBeNull();
  });

  it('配合分栏补全', () => {
    const value = range('7:30-9:00', 'evening');
    expect(value.start).toBe(1170);
    expect(value.end).toBe(1260);
  });
});

describe('纸面时间：拒绝而不是瞎猜', () => {
  it('空输入', () => {
    expect(parseTimeRange('').ok).toBe(false);
  });

  it('纯文字', () => {
    expect(parseTimeRange('做数学').ok).toBe(false);
  });

  it('结束明显早于开始（不是跨零点）', () => {
    expect(parseTimeRange('20:00-19:00').ok).toBe(false);
  });

  it('时长异常（超过 8 小时）', () => {
    expect(parseTimeRange('08:00-18:00').ok).toBe(false);
  });
});
