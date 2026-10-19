import { Button, cn, focusRing } from '@gofor/ui';
import type { Quad } from '@gofor/vision';
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react';

export interface CornerPickerProps {
  /** 照片的 object URL（调用方负责 revoke）。 */
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  /** 初始四角（像素坐标，TL/TR/BR/BL）；不传就按内缩 6% 的矩形兜底。 */
  initialQuad?: Quad;
  onConfirm: (quad: Quad) => void;
  onCancel: () => void;
}

type CornerIndex = 0 | 1 | 2 | 3;

const CORNER_LABELS = ['左上', '右上', '右下', '左下'] as const;

function insetQuad(width: number, height: number): Quad {
  const dx = width * 0.06;
  const dy = height * 0.06;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

/**
 * 手动点四角（P2-2.2）。
 *
 * 为什么默认就是"手动"：自动找纸（`detectPageQuad`）在背景复杂、卷边、
 * 纸被裁出画面时会失败或退化，而这些正是学生拍照的常态。
 * 手动四角永远可用，是**主路径**不是应急；自动结果只作为初始值预填。
 *
 * 坐标存"原图像素"，不是屏幕像素：照片会按容器缩放，换算关系在渲染时算。
 */
export function CornerPicker({
  imageUrl,
  naturalWidth,
  naturalHeight,
  initialQuad,
  onConfirm,
  onCancel,
}: CornerPickerProps) {
  const [quad, setQuad] = useState<Quad>(
    () => initialQuad ?? insetQuad(naturalWidth, naturalHeight),
  );
  const [dragging, setDragging] = useState<CornerIndex | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const moveTo = useCallback(
    (corner: CornerIndex, clientX: number, clientY: number) => {
      const host = containerRef.current;
      if (host === null) return;
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // 屏幕坐标 → 原图像素坐标，并钳制在图内（点出画面会让单应退化成 NaN）
      const x = Math.min(
        naturalWidth,
        Math.max(0, ((clientX - rect.left) / rect.width) * naturalWidth),
      );
      const y = Math.min(
        naturalHeight,
        Math.max(0, ((clientY - rect.top) / rect.height) * naturalHeight),
      );
      setQuad((current) => {
        const next = [...current] as Quad;
        next[corner] = { x, y };
        return next;
      });
    },
    [naturalWidth, naturalHeight],
  );

  const onPointerDown = (corner: CornerIndex) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(corner);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    moveTo(dragging, event.clientX, event.clientY);
  };

  const onPointerUp = () => setDragging(null);

  return (
    <div className="space-y-3">
      <p className="text-small leading-relaxed opacity-60">
        把四个角拖到纸的四个角上。纸要尽量摊平、别卷边——矫正之后按坐标读数。
      </p>

      <div
        ref={containerRef}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-line bg-ink/[0.03]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={imageUrl} alt="待矫正的纸" className="block h-auto w-full" draggable={false} />

        {/* 四边形的边：纯展示，不可交互 */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
          preserveAspectRatio="none"
        >
          <polygon
            points={quad.map((point) => `${point.x},${point.y}`).join(' ')}
            className="fill-ink/[0.08] stroke-ink/70"
            strokeWidth={Math.max(2, naturalWidth / 400)}
          />
        </svg>

        {quad.map((point, index) => (
          <button
            key={CORNER_LABELS[index]}
            type="button"
            aria-label={`${CORNER_LABELS[index]}角`}
            onPointerDown={onPointerDown(index as CornerIndex)}
            style={{
              left: `${(point.x / naturalWidth) * 100}%`,
              top: `${(point.y / naturalHeight) * 100}%`,
            }}
            className={cn(
              'absolute size-9 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-ink shadow-card',
              focusRing,
            )}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" onClick={() => onConfirm(quad)}>
          用这四个角矫正
        </Button>
        <Button variant="secondary" onClick={() => setQuad(insetQuad(naturalWidth, naturalHeight))}>
          重置四角
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          换一张
        </Button>
      </div>
    </div>
  );
}
