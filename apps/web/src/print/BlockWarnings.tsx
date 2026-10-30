import { Card } from '@gofor/ui';

/**
 * 打印/预览下方的"缺失插件"警告。
 *
 * 插件被禁用/卸载后，它拥有的区块会被静默跳过（不画空框、不打印）；
 * 这里负责把"少了什么"说清楚。插件数据不会被删除，重新启用即可恢复。
 */
export function BlockWarnings({ warnings }: { warnings?: string[] | undefined }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <Card
      padding="none"
      className="max-h-56 space-y-1 overflow-y-auto overscroll-contain border-warn/40 bg-card-faint px-3 py-2 text-caption break-words text-warn"
      role="status"
      data-e2e="block-warnings"
    >
      <p className="font-medium">部分区块未渲染 / 未打印</p>
      <ul className="list-disc space-y-0.5 pl-4 opacity-80">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="text-micro opacity-60">
        插件数据会保留；重新启用插件后再预览或打印即可恢复这些区块。
      </p>
    </Card>
  );
}
