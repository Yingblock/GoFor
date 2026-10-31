import type {
  PluginScreenHost,
  PluginScreenProps,
  PluginSlotProps,
  SlotName,
} from '@gofor/plugin-api';
import { Button, Card } from '@gofor/ui';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { ScreenBoundary } from '../components/ErrorBoundary.tsx';
import { usePluginHost } from './host.tsx';
import { errorText, isStaleChunkError, reloadOnceForStaleChunk } from './staleChunk.ts';
import type { RegisteredSlot, ScreenEntry } from './types.ts';

type ScreenLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; stale: boolean }
  | { status: 'ready'; Component: ComponentType<PluginScreenProps> };

/**
 * 插件页面容器。
 *
 * 负责三件事，且都在宿主这一侧：
 * 1. 懒加载（`load()`）——插件页面不挤进首屏单 chunk；
 * 2. 加载失败时给出可读错误，而不是白屏；
 * 3. 包 `ScreenBoundary`，一页崩了不连累导航/命令面板/打印层（`docs/STANDARD.md` 规则 7）。
 */
export function PluginScreenView({ entry }: { entry: ScreenEntry }) {
  const host = usePluginHost();
  const [state, setState] = useState<ScreenLoadState>({ status: 'loading' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 按页面 id + 宿主版本懒加载；不依赖 entry 对象本身（每次重建都是新对象）
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    const load = entry.load;
    if (!load) {
      setState({ status: 'error', message: '插件没有提供页面加载函数', stale: false });
      return;
    }
    Promise.resolve()
      .then(load)
      .then((module) => {
        if (!alive) return;
        if (typeof module.default !== 'function') {
          throw new Error('页面模块没有默认导出 React 组件');
        }
        setState({
          status: 'ready',
          Component: module.default as unknown as ComponentType<PluginScreenProps>,
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const stale = isStaleChunkError(error);
        if (stale && reloadOnceForStaleChunk()) return;
        setState({ status: 'error', message: errorText(error), stale });
      });
    return () => {
      alive = false;
    };
  }, [entry.id, host.version]);

  const screenHost = useMemo<PluginScreenHost>(
    () => ({
      navigate: host.navigate,
      back: host.back,
      now: host.now,
      newId: host.newId,
      data: host.dataFor(entry.pluginId ?? 'unknown'),
      storage: host.storageFor(entry.pluginId ?? 'unknown'),
      store: host.storeFor(entry.pluginId ?? 'unknown'),
      applyScan: host.applyScan,
    }),
    [host, entry.pluginId],
  );

  if (state.status === 'loading') {
    return <p className="py-8 text-center text-small opacity-40">正在加载插件页面…</p>;
  }

  if (state.status === 'error') {
    if (state.stale) {
      return (
        <Card padding="none" className="px-4 py-6" role="alert">
          <h2 className="text-title font-medium">页面已更新，需要刷新</h2>
          <p className="mt-2 text-small leading-relaxed opacity-50">
            插件资源随新版本更新了；刷新一次即可继续，本地数据不会丢。
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
            <Button variant="ghost" onClick={() => host.navigate('home')}>
              回到首页
            </Button>
          </div>
        </Card>
      );
    }
    return (
      <Card padding="none" className="px-4 py-6" role="alert">
        <h2 className="text-title font-medium">插件「{entry.title}」加载失败</h2>
        <p className="mt-1 break-words font-mono text-caption leading-relaxed opacity-50">
          {state.message}
        </p>
        <p className="mt-2 text-small leading-relaxed opacity-40">
          到「插件与扩展」里禁用或卸载它，其它页面不受影响。
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => host.navigate('plugins')}>
            打开插件目录
          </Button>
          <Button variant="ghost" onClick={() => host.navigate('home')}>
            回到首页
          </Button>
        </div>
      </Card>
    );
  }

  const Component = state.Component;
  return (
    <ScreenBoundary resetKey={entry.id}>
      <Component pluginId={entry.pluginId ?? ''} screenId={entry.id} host={screenHost} />
    </ScreenBoundary>
  );
}

/** 命名插槽：按位置收集所有插件贡献，空则什么都不渲染。 */
export function PluginSlot({ name }: { name: SlotName }) {
  const host = usePluginHost();
  const contributions = host.slots.filter((slot) => slot.slot === name);
  if (contributions.length === 0) return null;
  return (
    <>
      {contributions.map((contribution) => (
        <PluginSlotItem key={contribution.id} contribution={contribution} />
      ))}
    </>
  );
}

type SlotLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; stale: boolean }
  | { status: 'ready'; Component: ComponentType<PluginSlotProps> };

function PluginSlotItem({ contribution }: { contribution: RegisteredSlot }) {
  const host = usePluginHost();
  const [state, setState] = useState<SlotLoadState>({ status: 'loading' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 按贡献项 id + 宿主版本懒加载；不依赖贡献对象本身
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    Promise.resolve()
      .then(contribution.load)
      .then((module) => {
        if (!alive) return;
        if (typeof module.default !== 'function') {
          throw new Error('插槽模块没有默认导出组件');
        }
        setState({
          status: 'ready',
          Component: module.default as unknown as ComponentType<PluginSlotProps>,
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const stale = isStaleChunkError(error);
        if (stale && reloadOnceForStaleChunk()) return;
        setState({ status: 'error', message: errorText(error), stale });
      });
    return () => {
      alive = false;
    };
  }, [contribution.id, host.version]);

  const slotHost = useMemo<PluginScreenHost>(
    () => ({
      navigate: host.navigate,
      back: host.back,
      now: host.now,
      newId: host.newId,
      data: host.dataFor(contribution.pluginId),
      storage: host.storageFor(contribution.pluginId),
      store: host.storeFor(contribution.pluginId),
      applyScan: host.applyScan,
    }),
    [host, contribution.pluginId],
  );

  if (state.status === 'loading') return null;

  if (state.status === 'error') {
    return (
      <p className="px-2 py-1 text-micro text-danger opacity-70" role="status">
        {state.stale
          ? '页面已更新，刷新后可加载该插件扩展'
          : `插件「${contribution.pluginId}」的扩展加载失败：${state.message}`}
      </p>
    );
  }

  const Component = state.Component;
  return (
    // display:contents 让包装层不参与布局；`data-plugin-surface` 是作用域 CSS 的根。
    <div className="contents" data-plugin-surface={contribution.pluginId}>
      <ScreenBoundary resetKey={`${contribution.id}:${host.version}`}>
        <Component pluginId={contribution.pluginId} host={slotHost} />
      </ScreenBoundary>
    </div>
  );
}
