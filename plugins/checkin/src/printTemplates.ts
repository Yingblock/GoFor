import type { PrintTemplate } from '@gofor/core/print';

export const CHECKIN_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'checkin',
    name: '打卡卡',
    paper: 'A5',
    blocks: [
      { id: 'title', kind: 'title', span: 12, text: '', align: 'center' },
      { id: 'grid', kind: 'checkboxGrid', span: 12, cols: 7, rows: 3 },
      { id: 'hint', kind: 'hintLine', span: 12, text: '做到了就打勾，没做到就留空' },
    ],
  },
];
