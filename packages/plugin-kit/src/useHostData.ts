import type { DataAvailability, PluginScreenHost } from '@gofor/plugin-api';
import { useEffect, useRef, useState } from 'react';

/**
 * 插件视图读宿主数据的 hook。
 *
 * 与 `apps/web/src/plugins/useData.ts` 的区别：这里**不依赖 React Context**，
 * 只用页面 props 里的 `host`。这样视图可以搬到 npm 包里，不反向 import 宿主。
 */
export function useHostData<T>(
  host: PluginScreenHost,
  contractId: string,
  input: unknown,
  fallback: T,
): T {
  const [value, setValue] = useState<T>(fallback);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const inputKey = JSON.stringify(input ?? null);
  const inputRef = useRef(input);
  inputRef.current = input;

  // biome-ignore lint/correctness/useExhaustiveDependencies: input 对象每次渲染都是新的，inputKey 才是重订阅条件
  useEffect(() => {
    let alive = true;
    setValue(fallbackRef.current);
    const unsubscribe = host.data.watch<T>(contractId, inputRef.current, (next) => {
      if (alive) setValue(next === null ? fallbackRef.current : next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [contractId, host, inputKey]);

  return value;
}

/** 数据契约是否可用；缺失时界面必须显示「未安装」，不能当 0。 */
export function useHostAvailability(host: PluginScreenHost, contractId: string): DataAvailability {
  void host.data;
  return host.data.status(contractId);
}
