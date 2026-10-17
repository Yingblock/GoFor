import { describe, expect, it } from 'vitest';
import { buildFillLink, type FillLink, parseFillLink } from './deeplink.ts';

const LINK: FillLink = {
  templateId: 'day',
  date: '2026-03-05',
  paper: 'A4',
  version: 1,
};

/** 取出失败原因，并顺带断言 ok 为 false。 */
function reasonOf(text: string): string {
  const result = parseFillLink(text);
  if (result.ok) throw new Error(`本应失败却解析成功：${text}`);
  return result.reason;
}

describe('回填链接：生成', () => {
  it('按 v/t/d/p 固定顺序生成', () => {
    expect(buildFillLink(LINK)).toBe('gofor://fill?v=1&t=day&d=2026-03-05&p=A4');
  });

  it('模板 id 里的中文与空格会 URL 编码', () => {
    const text = buildFillLink({ ...LINK, templateId: '数学 卷子' });
    expect(text).toContain('t=%E6%95%B0%E5%AD%A6%20%E5%8D%B7%E5%AD%90');
    const parsed = parseFillLink(text);
    expect(parsed).toEqual({ ok: true, value: { ...LINK, templateId: '数学 卷子' } });
  });

  it('日期非法时拒绝生成，不印出坏纸', () => {
    expect(() => buildFillLink({ ...LINK, date: '2026-02-30' })).toThrow();
    expect(() => buildFillLink({ ...LINK, date: '2026-3-5' })).toThrow();
    expect(() => buildFillLink({ ...LINK, templateId: '' })).toThrow();
    expect(() => buildFillLink({ ...LINK, paper: '' })).toThrow();
  });
});

describe('回填链接：解析', () => {
  it('生成后能原样解析回来（往返）', () => {
    expect(parseFillLink(buildFillLink(LINK))).toEqual({ ok: true, value: LINK });
  });

  it('中文与空格模板 id 往返不变', () => {
    const value: FillLink = { ...LINK, templateId: '数学 卷子' };
    expect(parseFillLink(buildFillLink(value))).toEqual({ ok: true, value });
  });

  it('缺版本号 v 失败', () => {
    expect(parseFillLink('gofor://fill?t=day&d=2026-03-05&p=A4')).toEqual({
      ok: false,
      reason: '缺少参数 v',
    });
  });

  it('缺日期 d 失败', () => {
    expect(reasonOf('gofor://fill?v=1&t=day&p=A4')).toBe('缺少参数 d');
  });

  it('日期格式错失败', () => {
    expect(reasonOf('gofor://fill?v=1&t=day&d=2026-3-5&p=A4')).toContain('日期格式');
  });

  it('日历上不存在的日期失败', () => {
    expect(reasonOf('gofor://fill?v=1&t=day&d=2026-02-30&p=A4')).toContain('日期不存在');
    expect(reasonOf('gofor://fill?v=1&t=day&d=2026-13-01&p=A4')).toContain('日期');
  });

  it('http(s) 链接失败', () => {
    expect(reasonOf('https://example.com/fill?v=1&t=day&d=2026-03-05&p=A4')).toContain(
      '只接受 gofor://fill',
    );
    expect(reasonOf('http://example.com/fill?v=1&t=day&d=2026-03-05&p=A4')).toContain(
      '只接受 gofor://fill',
    );
  });

  it('别的自定义 scheme 失败', () => {
    expect(reasonOf('gofor://scan?v=1&t=day&d=2026-03-05&p=A4')).toContain('只接受 gofor://fill');
    expect(reasonOf('otpauth://fill?v=1&t=day&d=2026-03-05&p=A4')).toContain('不支持的链接协议');
  });

  it('版本号 2 失败', () => {
    expect(parseFillLink('gofor://fill?v=2&t=day&d=2026-03-05&p=A4')).toEqual({
      ok: false,
      reason: '版本号不认识：2',
    });
  });

  it('空字符串失败', () => {
    expect(parseFillLink('')).toEqual({ ok: false, reason: '内容为空，不是有效的回填二维码' });
    expect(parseFillLink('   ').ok).toBe(false);
  });

  it('多余参数失败（不静默忽略）', () => {
    expect(reasonOf('gofor://fill?v=1&t=day&d=2026-03-05&p=A4&x=1')).toBe('不认识的参数：x');
  });

  it('参数重复失败', () => {
    expect(reasonOf('gofor://fill?v=1&v=1&t=day&d=2026-03-05&p=A4')).toBe('参数重复：v');
  });

  it('参数值为空失败', () => {
    expect(reasonOf('gofor://fill?v=1&t=&d=2026-03-05&p=A4')).toBe('参数 t 不能为空');
    expect(reasonOf('gofor://fill?v=&t=day&d=2026-03-05&p=A4')).toBe('参数 v 不能为空');
  });

  it('没有查询串失败', () => {
    expect(reasonOf('gofor://fill')).toBe('缺少参数 v');
  });
});
