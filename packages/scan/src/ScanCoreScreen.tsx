import type { Task } from '@gofor/core/domain';
import type { PrintTemplate } from '@gofor/core/print';
import type { PluginScreenProps } from '@gofor/plugin-api';
import { pluginStore } from '@gofor/plugin-kit/store';
import { ScanScreen } from './Scan.tsx';

/** 扫描页需要一个"去打印"的跳转；由宿主注入，而不是让扫描页自己改 hash。 */
export function ScanCoreScreen({
  host,
  templates,
}: PluginScreenProps & { templates: readonly PrintTemplate[] }) {
  return (
    <ScanScreen
      store={pluginStore(host.store)}
      applyScan={host.applyScan}
      onOpenPrint={() => host.navigate('print')}
      tasksAvailable={host.data.available('tasks.all')}
      loadTasks={async () => (await host.data.query<Task[]>('tasks.all')) ?? []}
      templates={templates}
    />
  );
}
