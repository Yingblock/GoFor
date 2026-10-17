export interface ComingSoonProps {
  title: string;
  groupCode: string;
  stage: 'P1' | 'P2';
  note: string;
}

/**
 * 未实现条目的占位页。
 *
 * 关键：**说清楚它在哪个模块、哪个阶段、为什么还没做**。
 * 不要用一个"敬请期待"糊过去——用户需要知道它在计划里的位置。
 */
export function ComingSoon({ title, groupCode, stage, note }: ComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="font-mono text-[11px] tracking-wide opacity-35">{groupCode}</div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed opacity-50">{note}</p>
      <p className="text-[11px] opacity-30">此条目属于阶段 {stage}，详见 docs/ROADMAP.md</p>
    </div>
  );
}
