/**
 * 任务实体。字段与 `@gofor/core/domain` 的 `Task` 保持一致。
 *
 * 这里独立定义而不是 import core：插件包安装在用户目录，不能依赖 monorepo
 * 源码；契约包是唯一允许被插件 import 的 GoFor 包。
 */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  subjectId: string | null;
  done: boolean;
  /** 截止日期 `YYYY-MM-DD`，无截止为 null。 */
  due: string | null;
  optional?: boolean;
  subtasks?: Subtask[];
  tags?: string[];
  sortKey: number;
  createdAt: number;
  updatedAt: number;
}

/** 插件命令。`handler` 在主进程执行；渲染进程通过 IPC `run-command` 触发。 */
export interface PluginCommand {
  /** 建议 `<pluginId>/<commandId>`，全局唯一。 */
  id: string;
  title: string;
  handler: () => void | Promise<void>;
}

/** 打印模板。`render` 必须同步返回纯文本/HTML 片段，不能碰 DOM。 */
export interface PluginPrintTemplate {
  id: string;
  render: (task: Task) => string;
}

/**
 * 插件能看到的全部宿主能力。**只有这五个方法**。
 *
 * 插件不能 import Dexie 或核心内部模块；所有数据读写都走 `getTasks` / `updateTask`。
 */
export interface GoForPluginAPI {
  registerCommand(command: PluginCommand): void;
  /**
   * 注册视图插槽。
   *
   * 主进程无法执行 React 组件，`component` 只用于登记：runtime 取
   * `component.displayName ?? component.name ?? 'default'` 作为渲染进程里的导出名。
   * 组件本身由渲染进程按 manifest 的 `gofor.renderer` 懒加载（见 `GoForPluginAPI` 文档）。
   */
  registerViewSlot(slotId: string, component: unknown): void;
  registerPrintTemplate(template: PluginPrintTemplate): void;
  getTasks(): Promise<Task[]>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
}

/**
 * 插件入口模块。入口文件必须导出 `activate`，可选导出 `deactivate`。
 *
 * ```ts
 * export function activate(api: GoForPluginAPI): void | Promise<void> { ... }
 * export function deactivate(api: GoForPluginAPI): void | Promise<void> { ... }
 * ```
 */
export interface GoForPluginModule {
  activate(api: GoForPluginAPI): void | Promise<void>;
  deactivate?(api: GoForPluginAPI): void | Promise<void>;
}
