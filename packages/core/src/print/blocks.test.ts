import { describe, expect, it } from 'vitest';
import {
  BLOCK_KINDS,
  blockHeightMm,
  type CheckboxGridBlock,
  type RatingGridBlock,
  validateBlock,
} from './blocks.ts';

const rating: RatingGridBlock = {
  id: 'mood',
  kind: 'ratingGrid',
  span: 12,
  labels: ['睡眠', '心情', '专注'],
  scale: 5,
  keys: ['sleep', 'mood', 'focus'],
};

const grid: CheckboxGridBlock = { id: 'habits', kind: 'checkboxGrid', span: 12, cols: 7, rows: 3 };

describe('区块：ratingGrid', () => {
  it('已加入区块种类', () => {
    expect(BLOCK_KINDS).toContain('ratingGrid');
  });

  it('高度 = 内边距 + 行数 × 格子边长，与 checkboxGrid 每行一致', () => {
    const rows = rating.labels.length;
    expect(blockHeightMm(rating)).toBe(8 + rows * 7);
    // 同样的行数下，ratingGrid 与 checkboxGrid 每行加的高度相同。
    expect(blockHeightMm(rating)).toBe(blockHeightMm({ ...grid, rows }) as number);
    expect(
      blockHeightMm({ ...rating, labels: ['睡眠', '心情'] }) -
        blockHeightMm({ ...rating, labels: ['睡眠'] }),
    ).toBe(7);
  });

  it('校验：合法通过；scale < 1 或没有行都报错', () => {
    expect(validateBlock(rating)).toEqual([]);

    const badScale = validateBlock({ ...rating, scale: 0 });
    expect(badScale).toHaveLength(1);
    expect(badScale[0]).toContain('scale');

    const noRows = validateBlock({ ...rating, labels: [] });
    expect(noRows).toHaveLength(1);
    expect(noRows[0]).toContain('至少需要一行');
  });
});
