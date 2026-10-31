import type { HomeBlockProps } from '@gofor/plugin-api';

const ACTION =
  'flex items-center gap-3 rounded-lg border border-line bg-card-soft px-4 py-4 text-left shadow-card transition duration-base ease-standard hover:bg-card';

/** 首页「纸面闭环」块：拍照回填 + 打印 checklist。 */
export function ScanHomeBlock({ host }: HomeBlockProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => host.navigate('gofor.scan/screen')} className={ACTION}>
        <span className="text-2xl">📷</span>
        <span>
          <span className="block text-body font-medium">拍照录入</span>
          <span className="block text-caption opacity-45">把纸上勾的扫回来 · 二维码定位</span>
        </span>
      </button>

      <button type="button" onClick={() => host.navigate('print')} className={ACTION}>
        <span className="text-2xl">🖨</span>
        <span>
          <span className="block text-body font-medium">打印 checklist</span>
          <span className="block text-caption opacity-45">今日一张纸，带去学校</span>
        </span>
      </button>
    </div>
  );
}
