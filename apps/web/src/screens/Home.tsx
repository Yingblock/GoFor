import type { HomeBlockProps } from '@gofor/plugin-api';
import { EmptyState } from '@gofor/ui';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { usePluginHost } from '../plugins/host.tsx';
import type { PluginHostApi, RegisteredHomeBlock } from '../plugins/types.ts';

/**
 * 首页。
 *
 * core 不再写死任何内容：任务、打卡、课表、统计、主行动都由插件注册成
 * `homeBlocks`。core 只做两件事：
 *   1. 按插件默认 order + 用户拖拽顺序排序；
 *   2. 给每块渲染标题和右侧拖拽手柄。
 *
 * 顺序存 localStorage（设备本地）；新增块默认追加到末尾。
 */
const ORDER_KEY = 'gofor.home.blockOrder';

function readOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function writeOrder(order: readonly string[]): void {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // 隐私模式写不进去；本次拖拽仍然生效，只是下次打开恢复默认。
  }
}

function blockSignature(blocks: readonly RegisteredHomeBlock[]): string {
  return blocks.map((block) => block.id).join('\u0000');
}

function defaultOrder(blocks: readonly RegisteredHomeBlock[]): string[] {
  return [...blocks]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((block) => block.id);
}

function HomeBlockView({
  block,
  host,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  block: RegisteredHomeBlock;
  host: PluginHostApi;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
}) {
  const [Component, setComponent] = useState<ComponentType<HomeBlockProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setComponent(null);
    setError(null);
    void block
      .load()
      .then((module) => {
        if (!alive) return;
        setComponent(() => module.default as unknown as ComponentType<HomeBlockProps>);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [block]);

  const blockHost = useMemo(
    () => ({
      ...host,
      storage: host.storageFor(block.pluginId),
      store: host.storeFor(block.pluginId),
    }),
    [host, block.pluginId],
  );

  return (
    <section
      aria-label={block.title}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(block.id);
      }}
      className={`rounded-xl border border-line bg-card-soft p-4 shadow-card transition ${
        dragging === block.id ? 'opacity-40' : 'opacity-100'
      } ${block.span === 2 ? 'md:col-span-2' : ''}`}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium opacity-60">{block.title}</h2>
        <button
          type="button"
          draggable
          aria-label={`拖动 ${block.title}`}
          title="拖动排序"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', block.id);
            onDragStart(block.id);
          }}
          onDragEnd={onDragEnd}
          className="cursor-grab select-none rounded px-1 text-lg leading-none opacity-30 transition hover:opacity-70 active:cursor-grabbing"
        >
          ⠿
        </button>
      </header>
      {error !== null ? (
        <p className="text-caption text-danger">内容加载失败：{error}</p>
      ) : Component === null ? (
        <p className="text-caption opacity-30">加载中…</p>
      ) : (
        <Component pluginId={block.pluginId} blockId={block.id} host={blockHost} />
      )}
    </section>
  );
}

export function Home() {
  const host = usePluginHost();
  const [order, setOrder] = useState<string[]>(readOrder);
  const [dragging, setDragging] = useState<string | null>(null);
  const signature = blockSignature(host.homeBlocks);

  // 块集合变化时合并顺序：已有的保留，新增的按插件默认 order 追加。
  useEffect(() => {
    setOrder((previous) => {
      const known = previous.filter((id) => host.homeBlocks.some((block) => block.id === id));
      const added = defaultOrder(host.homeBlocks).filter((id) => !known.includes(id));
      const next = [...known, ...added];
      if (next.join('\u0000') === previous.join('\u0000')) return previous;
      writeOrder(next);
      return next;
    });
  }, [signature, host.homeBlocks]);

  const blocks = useMemo(() => {
    const index = new Map(order.map((id, position) => [id, position]));
    return [...host.homeBlocks].sort((a, b) => {
      const ai = index.get(a.id);
      const bi = index.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.order - b.order || a.id.localeCompare(b.id);
    });
  }, [host.homeBlocks, order]);

  const dropOn = (targetId: string) => {
    if (dragging === null || dragging === targetId) {
      setDragging(null);
      return;
    }
    setOrder((previous) => {
      const next = previous.filter((id) => id !== dragging);
      const target = next.indexOf(targetId);
      next.splice(target < 0 ? next.length : target, 0, dragging);
      writeOrder(next);
      return next;
    });
    setDragging(null);
  };

  if (host.homeBlocks.length === 0) {
    return (
      <EmptyState size="md">
        还没有插件注册首页内容。启用一个带「首页内容」权限的插件后，它会出现在这里。
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {blocks.map((block) => (
        <HomeBlockView
          key={block.id}
          block={block}
          host={host}
          dragging={dragging}
          onDragStart={setDragging}
          onDragEnd={() => setDragging(null)}
          onDrop={dropOn}
        />
      ))}
    </div>
  );
}
