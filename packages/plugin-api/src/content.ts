/**
 * 内容模块的数据形状（P3-3.7 / P4-4.16）。
 *
 * 只有 wordbook v1 在本阶段落地（导入 / 存 / 查 / 标签，不做复习）。
 * notebook 与 file-view 先定契约，等 P4/P5 的块编辑器与资产层再填实现——
 * 现在写一个半成品编辑器，P4 一定会推翻重来。
 */

export interface WordbookEntry {
  id: string;
  term: string;
  meaning: string;
  /** 标签不带 `#`，去重后存。 */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WordbookQuery {
  /** 词或释义里的包含匹配（大小写不敏感）。 */
  query?: string;
  tag?: string;
}

/** notebook 的块文档在 P4-4.2 定义；这里只留最小占位，防止两处各写一个。 */
export interface NotebookDocument {
  id: string;
  title: string;
  /** 块数组，形状由 P4 的块文档模型决定。 */
  blocks: unknown[];
  createdAt: number;
  updatedAt: number;
}

export interface FileViewRequest {
  /** 文件柜的资产 id（P4-4.15 最小资产层）。 */
  fileId: string;
  mime: string;
}
