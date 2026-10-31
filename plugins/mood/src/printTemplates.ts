import type { PrintTemplate } from '@gofor/core/print';

export const MOOD_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'mood',
    name: '三格自评',
    paper: 'A5',
    blocks: [
      { id: 'title', kind: 'title', span: 12, text: '', align: 'center' },
      {
        id: 'rating',
        kind: 'ratingGrid',
        span: 12,
        labels: ['睡眠', '心情', '专注'],
        keys: ['sleep', 'mood', 'focus'],
        scale: 5,
      },
      { id: 'hint', kind: 'hintLine', span: 12, text: '1 到 5 分，凭第一感觉' },
    ],
  },
];
