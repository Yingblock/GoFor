import type { PluginScreenProps } from '@gofor/plugin-api';
import { ScanScreen } from './Scan.tsx';

/** 扫描页需要一个"去打印"的跳转；由宿主注入，而不是让扫描页自己改 hash。 */
export function ScanPluginScreen({ host }: PluginScreenProps) {
  return (
    <ScanScreen
      applyScan={host.applyScan}
      onOpenPrint={() => host.navigate('print')}
      tasksAvailable={host.data.available('tasks.all')}
    />
  );
}
