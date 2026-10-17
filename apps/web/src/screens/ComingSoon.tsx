export interface ComingSoonProps {
  title: string;
  groupCode: string;
  /** 产品部分（离线 / 在线），不是开发阶段。 */
  part: 'offline' | 'online';
  note: string;
}

/**
 * 未实现条目的占位页。
 *
 * 关键：**说清楚它在哪个产品部分、为什么还没做**，以及去 ROADMAP 看开发阶段。
 * 不要用一个"敬请期待"糊过去。注意「P1」只表示开发阶段，别和产品部分混用。
 */
export function ComingSoon({ title, groupCode, part, note }: ComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="font-mono text-[11px] tracking-wide opacity-35">{groupCode}</div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed opacity-50">{note}</p>
      <p className="text-[11px] opacity-30">
        此条目属于产品「{part === 'offline' ? '离线' : '在线'}」部分；开发阶段见 docs/ROADMAP.md
      </p>
    </div>
  );
}
