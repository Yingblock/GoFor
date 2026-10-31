import type { Task } from '@gofor/core/domain';
import type { HomeBlockProps } from '@gofor/plugin-api';
import { pluginStore } from '@gofor/plugin-kit/store';
import { Card, Checkbox, EmptyState, Section, StatCard } from '@gofor/ui';
import { useLiveQuery } from 'dexie-react-hooks';

const LINK_ACTION = 'text-small opacity-40 transition-opacity duration-fast hover:opacity-70';

/** 首页「作业清单」块：任务统计 + 未完成任务。数据只属于本插件。 */
export function TaskHomeBlock({ host }: HomeBlockProps) {
  const store = pluginStore(host.store);
  const tasks = useLiveQuery(() => store.listTasks(), [store], [] as Task[]);
  const done = tasks.filter((task) => task.done).length;
  const pending = tasks.length - done;
  const unfinished = tasks.filter((task) => !task.done).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="今日作业" value={`${done}/${tasks.length}`} />
        <StatCard label="待办" value={String(pending)} />
      </div>

      <Section
        title="任务提示"
        actions={
          <>
            <button
              type="button"
              onClick={() => host.navigate('gofor.pomodoro/screen')}
              className={LINK_ACTION}
            >
              开始专注 →
            </button>
            <button
              type="button"
              onClick={() => host.navigate('gofor.tasks/screen')}
              className={LINK_ACTION}
            >
              去作业清单 →
            </button>
          </>
        }
      >
        {unfinished.length === 0 ? (
          <EmptyState size="md">
            {tasks.length === 0 ? '还没有作业，先加一条' : '今天的作业都完成了'}
          </EmptyState>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">
              {unfinished.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                  <Checkbox
                    aria-label={`完成 ${task.title}`}
                    checked={false}
                    onChange={() => void store.setTaskDone(task.id, true, host.now())}
                  />
                  <span className="min-w-0 flex-1 break-words">{task.title}</span>
                  {task.due ? <span className="text-caption opacity-40">{task.due}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
    </div>
  );
}
