import { dateKey, type HabitLog } from '@gofor/core/domain';
import { type Habit, isHabitActiveOn } from '@gofor/domain/habits';
import type { HomeBlockProps } from '@gofor/plugin-api';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '@gofor/plugin-kit';
import { pluginStore } from '@gofor/plugin-kit/store';
import { Card, Checkbox, EmptyState, Section } from '@gofor/ui';
import { useLiveQuery } from 'dexie-react-hooks';

const LINK_ACTION = 'text-small opacity-40 transition-opacity duration-fast hover:opacity-70';

/** 首页「打卡提示」块。打卡项与日志只属于打卡插件。 */
export function CheckinHomeBlock({ host }: HomeBlockProps) {
  const store = pluginStore(host.store);
  const today = dateKey(appClock);
  const habits = useLiveQuery(() => store.listHabits(), [store], [] as Habit[]);
  const todayLogs = useLiveQuery(
    () => store.listHabitLogs(today, today),
    [store, today],
    [] as HabitLog[],
  );

  const activeHabits = habits.filter((habit) => isHabitActiveOn(habit, today));
  const doneHabitIds = new Set(todayLogs.filter((log) => log.done).map((log) => log.habitId));
  const pendingHabits = activeHabits.filter((habit) => !doneHabitIds.has(habit.id));
  const doneCount = activeHabits.length - pendingHabits.length;

  return (
    <Section
      title="打卡提示"
      actions={
        <>
          {activeHabits.length > 0 ? (
            <span className="text-caption tabular-nums opacity-35">
              {doneCount}/{activeHabits.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => host.navigate('gofor.checkin/screen')}
            className={LINK_ACTION}
          >
            去打卡页 →
          </button>
        </>
      }
    >
      {activeHabits.length === 0 ? (
        <EmptyState>
          {habits.length === 0 ? '还没有打卡项，去打卡页新建一个' : '今天没有安排打卡'}
        </EmptyState>
      ) : pendingHabits.length === 0 ? (
        <EmptyState>今天的打卡都完成了</EmptyState>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-line">
            {pendingHabits.map((habit) => (
              <li key={habit.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                <Checkbox
                  aria-label={`打卡 ${habit.name}`}
                  checked={false}
                  onChange={() => void store.setHabitLog(habit.id, today, true, host.now())}
                />
                <span className="min-w-0 flex-1 break-words">{habit.name}</span>
                <span className="text-micro opacity-30">待打卡</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}
