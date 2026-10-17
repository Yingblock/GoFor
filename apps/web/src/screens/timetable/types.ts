/** 编辑模式下点格子弹出的浮层。 */
export type EditPopover =
  | { kind: 'add'; day: number; periodIndex: number; x: number; y: number }
  | {
      kind: 'delete';
      ruleId: string;
      courseId: string;
      startPeriod: number;
      span: number;
      x: number;
      y: number;
    };

/** 浮层宽/高估算：只用于防止浮层被网格容器裁掉，不参与布局计算。 */
export const POPOVER_WIDTH = 224;
export const POPOVER_HEIGHT = 260;
