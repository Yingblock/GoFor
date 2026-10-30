import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  filterWordbookEntries,
  mergeWordbookEntries,
  parseWordbook,
} from './wordbook.ts';

describe('detectDelimiter', () => {
  it('Tab 优先，其次分号，再逗号', () => {
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(detectDelimiter('a;b')).toBe(';');
    expect(detectDelimiter('a,b')).toBe(',');
    expect(detectDelimiter('')).toBe(',');
  });
});

describe('parseWordbook', () => {
  it('解析基础 CSV 并识别表头', () => {
    const result = parseWordbook('单词,释义,tags\napple,苹果,水果;食物\nrun,跑\n');
    expect(result.headerDetected).toBe(true);
    expect(result.rows).toEqual([
      { term: 'apple', meaning: '苹果', tags: ['水果', '食物'] },
      { term: 'run', meaning: '跑', tags: [] },
    ]);
    expect(result.skipped).toBe(0);
  });

  it('TSV 自动识别，无需表头', () => {
    const result = parseWordbook('apple\t苹果\tabc\nrun\t跑');
    expect(result.delimiter).toBe('\t');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ term: 'apple', meaning: '苹果', tags: ['abc'] });
  });

  it('引号里的逗号/换行不拆行', () => {
    const result = parseWordbook('apple,"苹果, 一种水果",水果\npear,"a ""pear""",');
    expect(result.rows[0]?.meaning).toBe('苹果, 一种水果');
    expect(result.rows[1]?.meaning).toBe('a "pear"');
  });

  it('CRLF 与 BOM 不会变成词的一部分', () => {
    const result = parseWordbook('\uFEFFword,meaning\r\napple,苹果\r\n');
    expect(result.headerDetected).toBe(true);
    expect(result.rows).toEqual([{ term: 'apple', meaning: '苹果', tags: [] }]);
  });

  it('重复词只留一条，标签合并（不是静默丢数据）', () => {
    const result = parseWordbook('apple,苹果,水果\nApple,苹果2,食物');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.meaning).toBe('苹果');
    expect(result.rows[0]?.tags).toEqual(['水果', '食物']);
  });

  it('空行、缺词、Excel 的 sep= 行被跳过并计数', () => {
    const result = parseWordbook('sep=,\n\n,没有词\napple,苹果\n');
    expect(result.rows).toEqual([{ term: 'apple', meaning: '苹果', tags: [] }]);
    expect(result.skipped).toBe(2);
  });

  it('标签去掉 # 前缀并去重', () => {
    const result = parseWordbook('apple,苹果,#水果; 食物;水果');
    expect(result.rows[0]?.tags).toEqual(['水果', '食物']);
  });

  it('只有一列时也能导入（释义留空，稍后补）', () => {
    const result = parseWordbook('apple\nbanana');
    expect(result.rows).toEqual([
      { term: 'apple', meaning: '', tags: [] },
      { term: 'banana', meaning: '', tags: [] },
    ]);
  });
});

describe('filterWordbookEntries', () => {
  const entries = [
    {
      id: '1',
      term: 'apple',
      meaning: '苹果',
      tags: ['水果'],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: '2',
      term: 'Pythagoras',
      meaning: '毕达哥拉斯',
      tags: ['数学'],
      createdAt: 2,
      updatedAt: 2,
    },
  ];

  it('词与释义都参与匹配，大小写不敏感', () => {
    expect(filterWordbookEntries(entries, { query: 'APP' })).toHaveLength(1);
    expect(filterWordbookEntries(entries, { query: '数学' })).toHaveLength(0);
    expect(filterWordbookEntries(entries, { query: '毕达' })).toHaveLength(1);
  });

  it('标签过滤与空查询', () => {
    expect(filterWordbookEntries(entries, { tag: '数学' }).map((entry) => entry.id)).toEqual(['2']);
    expect(filterWordbookEntries(entries)).toHaveLength(2);
    expect(filterWordbookEntries(entries, { query: '   ' })).toHaveLength(2);
  });
});

describe('mergeWordbookEntries', () => {
  it('新词用注入的 id 与时间；旧词更新释义、标签取并集', () => {
    const existing = [
      {
        id: 'old',
        term: 'apple',
        meaning: '苹果（旧）',
        tags: ['水果'],
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    let counter = 0;
    const nextId = () => {
      counter += 1;
      return `new-${counter}`;
    };
    const result = mergeWordbookEntries(
      existing,
      [
        { term: 'Apple', meaning: '苹果', tags: ['食物'] },
        { term: 'pear', meaning: '梨', tags: [] },
      ],
      { now: 99, newId: nextId },
    );
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.entries.find((entry) => entry.id === 'old')).toMatchObject({
      id: 'old',
      meaning: '苹果',
      tags: ['水果', '食物'],
      updatedAt: 99,
    });
    expect(result.entries.find((entry) => entry.term === 'pear')?.id).toBe('new-1');
  });

  it('空释义不覆盖已有释义（导入一份只有词的清单不会洗掉释义）', () => {
    const existing = [
      { id: 'old', term: 'apple', meaning: '苹果', tags: [], createdAt: 1, updatedAt: 1 },
    ];
    const result = mergeWordbookEntries(existing, [{ term: 'apple', meaning: '', tags: [] }], {
      now: 2,
      newId: () => 'new',
    });
    expect(result.entries[0]?.meaning).toBe('苹果');
  });
});
