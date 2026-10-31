import type {
  PluginDataRegistration,
  PluginPrintTemplate,
  PluginScanHandlerRegistration,
  PluginScreenRegistration,
  PluginStatus,
  PluginThemeRegistration,
  Task,
} from '@gofor/contracts';

/**
 * 主进程侧的任务仓储。**必须由宿主注入**：
 * 渲染进程的数据在 IndexedDB 里，主进程读不到；Electron 宿主用 IPC 转发过去，
 * 测试用内存实现。PluginManager 自己不拥有数据。
 */
export interface TaskStore {
  getTasks(): Promise<Task[]>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
}

/** 通过 IPC 交给渲染进程的插槽元数据。函数/组件不能跨进程，只传可序列化字段。 */
export interface PluginViewSlotDescriptor {
  slotId: string;
  pluginId: string;
  packageName: string;
  /** manifest.gofor.renderer 的相对路径；没声明为 null。 */
  renderer: string | null;
  /** 从 component.displayName / component.name 推出的导出名。 */
  componentName: string;
}

export interface PluginCommandDescriptor {
  id: string;
  title: string;
  pluginId: string;
  packageName: string;
}

export interface PluginScreenDescriptor extends PluginScreenRegistration {
  pluginId: string;
  packageName: string;
  renderer: string | null;
}

export interface PluginThemeDescriptor extends PluginThemeRegistration {
  pluginId: string;
  packageName: string;
}

export interface PluginDataDescriptor extends PluginDataRegistration {
  pluginId: string;
  packageName: string;
}

export interface PluginScanHandlerDescriptor extends PluginScanHandlerRegistration {
  pluginId: string;
  packageName: string;
}

export interface PluginPrintTemplateDescriptor {
  id: string;
  pluginId: string;
  packageName: string;
}

/** `snapshot()` 的完整结果；全部可 JSON 序列化，可直接走 IPC。 */
export interface PluginSnapshot {
  /** 每次加载/卸载/重载递增；渲染进程用它判断要不要重新拉取。 */
  version: number;
  plugins: PluginStatus[];
  slots: PluginViewSlotDescriptor[];
  commands: PluginCommandDescriptor[];
  printTemplates: PluginPrintTemplateDescriptor[];
  screens: PluginScreenDescriptor[];
  themes: PluginThemeDescriptor[];
  data: PluginDataDescriptor[];
  scanHandlers: PluginScanHandlerDescriptor[];
}

export interface RunCommandResult {
  ok: boolean;
  error: string | null;
}

export interface RegisteredPrintTemplate extends PluginPrintTemplate {
  pluginId: string;
  packageName: string;
}
