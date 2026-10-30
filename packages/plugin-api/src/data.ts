/**
 * 数据能力契约：插件之间**唯一**的取数方式。
 *
 * 为什么不让插件互读 `pluginData`：B 被禁用/卸载后 A 会静默读到空，
 * 变成"周报显示本周 0 分钟"这种看不出来的错数据。走契约后，缺数据是
 * 一个可表达的 `null` / 「未安装」，而不是 0。
 *
 * core 的学习时长/打卡/作业/三格自评也做成内置 provider，
 * 与插件走同一条路（见 `docs/DECISIONS/0004`）。
 */
export interface DataContract<TInput = unknown, TOutput = unknown> {
  /** 点分命名：`sessions.range` / `wordbook.entries`。 */
  id: string;
  /** 破坏性变更 +1；结构性变更换 id。消费者版本必须严格相等。 */
  version: number;
  /** 安装页与周报页面板给用户看的白话说明。 */
  summary: string;
  /** 只读，返回可结构化克隆的 plain JSON。 */
  query(input: TInput): Promise<TOutput>;
  /**
   * 宿主缓存键：同一 revision 下可以复用 query 结果。
   *
   * 不要求"改一个字节就变"，只要求"变了必须不同"（宁可多算一次）。
   */
  revision(): Promise<number>;
}

/** 消费者看到的数据可用性。`missing` 一定要显示「未安装」，不能退化成 0。 */
export type DataAvailability =
  | { status: 'available'; providerId: string; version: number }
  | { status: 'missing'; reason: 'not-installed' | 'version-mismatch' | 'provider-error' };

/** 数据客户端（宿主注入给插件与页面）。 */
export interface DataClient {
  /** 这个契约当前是否可用（同步判断，渲染时用）。 */
  available(id: string): boolean;
  /** 取数；没有可用 provider 时返回 `null`，**不抛错**（可选依赖不该炸掉页面）。 */
  query<T = unknown>(id: string, input?: unknown): Promise<T | null>;
  /** 没有可用 provider 时为 `null`。 */
  revision(id: string): Promise<number | null>;
  /**
   * 订阅数据变化。宿主用 IndexedDB 的 liveQuery 实现，所以不需要插件自己轮询。
   * 返回取消订阅函数。
   */
  watch<T = unknown>(id: string, input: unknown, onChange: (value: T | null) => void): () => void;
  /** 依赖解析结果，安装页用它显示「未安装」。 */
  status(id: string): DataAvailability;
}
