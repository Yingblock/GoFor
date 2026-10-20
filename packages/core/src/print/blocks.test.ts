import { describe, expect, it } from 'vitest';
import {
  BLOCK_KINDS,
  blockHeightMm,
  type CheckboxGridBlock,
  HABIT_ROW_MAX,
  type HabitRowBlock,
  habitRowLayout,
  habitRowRows,
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

describe('区块：habitRow 多行', () => {
  const habitRow: HabitRowBlock = { id: 'habits', kind: 'habitRow', span: 12 };

  it('每行最多 6 个，超过就换行', () => {
    expect(habitRowLayout(0)).toEqual([]);
    expect(habitRowLayout(1)).toEqual([1]);
    expect(habitRowLayout(6)).toEqual([6]);
    expect(habitRowLayout(7)).toEqual([4, 3]);
  });

  it('各行数量最多相差 1（尽量均分）', () => {
    expect(habitRowLayout(13)).toEqual([5, 4, 4]);
    expect(habitRowLayout(8)).toEqual([4, 4]);
    expect(habitRowLayout(20)).toEqual([5, 5, 5, 5]);
    for (const count of [1, 2, 5, 7, 9, 13, 17, 31, 60]) {
      const rows = habitRowLayout(count);
      expect(rows.reduce((sum, size) => sum + size, 0)).toBe(count);
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
      expect(Math.max(...rows)).toBeLessThanOrEqual(HABIT_ROW_MAX);
    }
  });

  it('高度 = 行数 × 7mm；没填 rows 时按 1 行', () => {
    expect(habitRowRows(habitRow)).toBe(1);
    expect(blockHeightMm(habitRow)).toBe(7);
    expect(blockHeightMm({ ...habitRow, rows: 3 })).toBe(21);
  });
});
