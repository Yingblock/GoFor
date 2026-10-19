import { Button, Input } from '@gofor/ui';
import { useState } from 'react';
import { applyOffsetTo, effectiveNow, getOffsetMs, resetOffset } from '../clock.ts';

// TODO(debug-clock): 上线前删除（整个 DebugPanel 及其入口）。

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 快捷偏移：相对当前生效时间累加，每次点击都会写入新偏移并立即 reload。 */
const QUICK_SHIFTS: readonly { label: string; deltaMs: number }[] = [
  { label: '−1 天', deltaMs: -DAY_MS },
  { label: '+1 天', deltaMs: DAY_MS },
  { label: '−1 小时', deltaMs: -HOUR_MS },
  { label: '+1 小时', deltaMs: HOUR_MS },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 本地时间 `YYYY-MM-DD HH:mm`（面板展示用，不引入日期库）。 */
function formatLocal(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `datetime-local` 的输入值：本地时间，不带时区与秒。 */
function toInputValue(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * 解析 `datetime-local` 的值。
 *
 * 手写拆字段而不是 `new Date(value)`：后者对"无时区的日期时间串"的解析
 * 在不同引擎上有历史差异，调试功能要的是确定的本地时间。
 */
function parseInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  if (!year || !month || !day || !hour || !minute) return null;
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * 偏移量的中文说明，例如 `+1 天`、`−1 小时 30 分钟`。
 *
 * 按分钟四舍五入：按钮给的是整天/整小时，`datetime-local` 也只到分钟；
 * 真实毫秒级的尾数（两次 `Date.now()` 之间的几毫秒）不该显示成
 * "9 天 23 小时 59 分钟 59 秒"。
 */
function formatOffset(ms: number): string {
  const totalMinutes = Math.round(ms / MINUTE_MS);
  if (totalMinutes === 0) return '无偏移';

  const sign = totalMinutes > 0 ? '+' : '−';
  let rest = Math.abs(totalMinutes);
  const days = Math.floor(rest / (24 * 60));
  rest -= days * 24 * 60;
  const hours = Math.floor(rest / 60);
  rest -= hours * 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (rest > 0) parts.push(`${rest} 分钟`);
  return `${sign}${parts.join(' ')}`;
}

/**
 * 调试面板：显示/修改宿主层的"当前时间"。
 *
 * 默认收起，挂在侧边栏底部，移动端抽屉里也能用。
 * TODO(debug-clock): 上线前删除（整个组件）。
 */
export function DebugPanel() {
  const offset = getOffsetMs();
  // 实际时间 = 生效时间 − 偏移；避免在调试 UI 里再直接调一次 Date.now()。
  const actualNow = effectiveNow() - offset;
  const [inputValue, setInputValue] = useState(() => toInputValue(effectiveNow()));

  const shiftBy = (deltaMs: number) => {
    // 相对**当前偏移**累加：目标 = 生效时间 + 增量，
    // applyOffsetTo 会把它换算成新偏移再 reload。
    applyOffsetTo(effectiveNow() + deltaMs);
  };

  const setToInput = () => {
    const target = parseInputValue(inputValue);
    if (target === null) return;
    applyOffsetTo(target);
  };

  const shifted = offset !== 0;

  return (
    <details className="max-h-[52vh] overflow-y-auto rounded-lg border border-line bg-white/60 px-3 py-2 text-caption">
      <summary className="cursor-pointer select-none font-medium opacity-60">
        调试 · 当前时间
        {shifted ? <span className="ml-1.5 text-danger">{formatOffset(offset)}</span> : null}
      </summary>

      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 opacity-45">实际时间</dt>
          <dd className="font-mono tabular-nums">{formatLocal(actualNow)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 opacity-45">生效时间</dt>
          <dd className={`font-mono tabular-nums ${shifted ? 'font-semibold text-danger' : ''}`}>
            {formatLocal(effectiveNow())}
          </dd>
        </div>
        {shifted ? (
          <div className="text-right text-micro text-danger">偏移 {formatOffset(offset)}</div>
        ) : null}
      </dl>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {QUICK_SHIFTS.map((action) => (
          <Button
            key={action.label}
            variant="secondary"
            size="sm"
            onClick={() => shiftBy(action.deltaMs)}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <Input
        type="datetime-local"
        step={60}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        aria-label="设为指定时间"
        className="mt-2"
      />

      <div className="mt-1.5 flex gap-1.5">
        <Button variant="primary" size="sm" onClick={setToInput} className="flex-1">
          设为此时间
        </Button>
        <Button variant="secondary" size="sm" onClick={() => resetOffset()} className="flex-1">
          重置
        </Button>
      </div>

      <p className="mt-2 text-micro leading-relaxed opacity-35">
        调试功能，正式版删除 · TODO(debug-clock)
      </p>
    </details>
  );
}
