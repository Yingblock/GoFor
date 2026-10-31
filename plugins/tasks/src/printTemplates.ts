import type { Block, TitleBlock } from '@gofor/core/print';
import type { PrintTemplate } from '@gofor/core/print';

const DEFAULT_HINT = '深色笔 · 不出框 · 不连笔';
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

function dateTitle(align: 'left' | 'center'): TitleBlock {
  return { id: 'title', kind: 'title', span: 12, text: '', align };
}
function hint(text: string): Block {
  return { id: 'hint', kind: 'hintLine', span: 12, text };
}
function linedBox(id: string, label: string, lines: number): Block {
  return { id, kind: 'linedBox', span: 12, label, lines };
}

/** 作业清单插件拥有的打印模板：主模板 + 规划类模板 + 校准页。 */
export const TASKS_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'day',
    name: '我的一天',
    paper: 'A4',
    density: 'day',
    blocks: [
      { ...dateTitle('left'), span: 9 },
      { id: 'qr', kind: 'qrcode', span: 3, sizeMm: 16 },
      { id: 'tasks', kind: 'checkboxList', span: 12, bind: 'tasks.today', rows: 8, showMeta: [] },
      { id: 'schedule', kind: 'schedule', span: 12, rows: 6, title: '今日课表' },
      { id: 'am', kind: 'timeLog', span: 12, dayPart: 'morning', rows: 2, label: '上午' },
      { id: 'pm', kind: 'timeLog', span: 12, dayPart: 'afternoon', rows: 2, label: '下午' },
      { id: 'ev', kind: 'timeLog', span: 12, dayPart: 'evening', rows: 2, label: '晚上' },
      {
        id: 'rating',
        kind: 'ratingGrid',
        span: 12,
        labels: ['睡眠', '心情', '专注'],
        keys: ['sleep', 'mood', 'focus'],
        scale: 5,
      },
      { id: 'habits', kind: 'habitRow', span: 12 },
      hint(DEFAULT_HINT),
    ],
  },
  {
    id: 'week',
    name: '本周计划',
    paper: 'A4',
    density: 'week',
    blocks: [
      dateTitle('left'),
      ...WEEKDAY_LABELS.map((label, index) => linedBox(`day-${index + 1}`, label, 3)),
      hint('周日晚上回看一遍，下周只改一处'),
    ],
  },
  {
    id: 'index-card',
    name: '口袋卡',
    paper: 'index-card',
    blocks: [
      linedBox('formula', '公式', 3),
      linedBox('words', '单词', 3),
      linedBox('todos', '待办', 3),
    ],
  },
  {
    id: 'countdown',
    name: '考试倒计时牌',
    paper: 'A4',
    blocks: [
      dateTitle('center'),
      { id: 'dots', kind: 'progressDots', span: 12, total: 100 },
      linedBox('days', '距考试还有 ____ 天', 1),
      hint('每天只写一个数字，划掉昨天'),
    ],
  },
  {
    id: 'calibration',
    name: '打印校准页',
    paper: 'A4',
    blocks: [
      {
        id: 'title',
        kind: 'title',
        span: 12,
        text: '打印校准页 · 请用实际大小（100%）打印',
        align: 'center',
      },
      hint('下边框应与纸边距对齐；四角标记应完整不裁切'),
      ...['10mm', '20mm', '30mm', '40mm', '50mm'].map((mark) => linedBox(`scale-${mark}`, mark, 1)),
      { id: 'footer', kind: 'footer', span: 12, text: 'GoFor 打印校准 v1 · 日期 ____' },
    ],
  },
];
