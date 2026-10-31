import type { PrintTemplate } from '@gofor/core/print';

export const TIMETABLE_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'timetable',
    name: '今日课表',
    paper: 'A5',
    blocks: [
      { id: 'title', kind: 'title', span: 12, text: '', align: 'left' },
      { id: 'schedule', kind: 'schedule', span: 12, rows: 8, title: '今日课表' },
      { id: 'hint', kind: 'hintLine', span: 12, text: '课前看一眼，课后记一笔' },
    ],
  },
];
