import { newId } from '@gofor/core';
import { dateKey, type HabitLog } from '@gofor/core/domain';
import {
  addDays,
  type Habit,
  habitDatesBetween,
  isHabitActiveOn,
  isHabitCheckableOn,
} from '@gofor/core/habits';
import { db, deleteHabit, listHabitLogs, listHabits, saveHabit, setHabitLog } from '@gofor/store';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  focusRing,
  Input,
  Section,
} from '@gofor/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
// TODO(debug-clock): 上线前删除（调试时钟入口，改回 `systemClock`）。
import { appClock } from '../clock.ts';

/** 历史方格只回看两周：够看清最近的节奏，又不至于把小屏挤爆。 */
const HISTORY_DAYS = 14;

/**
 * 连续天数要从今天一直往回数，两周的窗口不够，所以日志一次多取一年。
 * 一年以上的连续打卡几乎不存在，用它当上限，避免把整张表读进内存。
 */
const STREAK_LOOKBACK_DAYS = 366;

/** 1=周一 … 7=周日，与 `Habit.weekdays` 的取值对齐。 */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

/**
 * 与仓储里 `setHabitLog` 写的主键格式一致（`${habitId}@${date}`）。
 *
 * 自己不另造一个键：键格式一旦和库里不一致，读出来的记录就对不上，
 * 界面上会全部显示成"未打卡"。
 */
function logKey(habitId: string, date: string): string {
  return `${habitId}@${date}`;
}

/** 把重复规则和起止日期说成人话。 */
function describeSchedule(habit: Habit): string {
  const repeat =
    habit.weekdays.length === 0
      ? '每天'
      : [...habit.weekdays]
          .sort((a, b) => a - b)
          .map((value) => WEEKDAYS.find((day) => day.value === value)?.label ?? `周${value}`)
          .join('、');
  const span =
    habit.endDate === null ? `${habit.startDate} 起` : `${habit.startDate} ~ ${habit.endDate}`;
  return `${repeat} · ${span}`;
}

/**
 * 某个打卡项的连续天数。
 *
 * 口径：从今天往回数，并且**只数这项排期内的日子**——没排期的日子
 * （比如"周一三五"里的周二）既不计数也不打断，否则这类项永远连不起来，
 * 数字就失去意义。到今天还没打就直接断（今天没打不算"连续到今天"）。
 *
 * 只认 `habitLogs`（用户手动勾的）：学习时长是"我花了多久"，
 * 打卡是"我做到了"，两者语义不同，混算会让打卡数字虚高。
 */
function streakOf(habit: Habit, doneKeys: Set<string>, today: string): number {
  let count = 0;
  let cursor = today;
  for (let guard = 0; guard < STREAK_LOOKBACK_DAYS; guard += 1) {
    // 开始日期之前不算失败：新项不该背着"创建前的日子"显示断掉。
    if (cursor < habit.startDate) break;
    if (isHabitActiveOn(habit, cursor)) {
      if (!doneKeys.has(logKey(habit.id, cursor))) break;
      count += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return count;
}

interface HabitDraft {
  name: string;
  weekdays: number[];
  /** 'YYYY-MM-DD'，必填。 */
  startDate: string;
  /** 'YYYY-MM-DD'，空字符串表示长期。 */
  endDate: string;
}

interface HabitFormProps {
  title: string;
  initial: HabitDraft;
  submitLabel: string;
  onSubmit: (draft: HabitDraft) => void;
  onCancel: () => void;
}

/**
 * 新建 / 编辑共用的行内面板。
 *
 * 不用 prompt / confirm：系统弹窗在这套离线 PWA 里样式不可控，
 * 也没法做"留空 = 每天"这种需要解释的输入。
 * 状态放组件内部，靠父级传 `key` 在切换目标时重建，避免残留上一次的草稿。
 */
function HabitFormPanel({ title, initial, submitLabel, onSubmit, onCancel }: HabitFormProps) {
  const [name, setName] = useState(initial.name);
  const [weekdays, setWeekdays] = useState<number[]>(initial.weekdays);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);

  const rangeInvalid = startDate !== '' && endDate !== '' && endDate < startDate;
  const canSubmit = name.trim() !== '' && startDate !== '' && !rangeInvalid;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ name, weekdays, startDate, endDate });
  };

  return (
    <Card padding="none" className="space-y-2.5 p-3">
      <div className="flex items-center justify-between text-small">
        <span className="opacity-60">{title}</span>
        <button
          type="button"
          onClick={onCancel}
          className={`text-caption opacity-40 transition-opacity duration-fast hover:opacity-70 ${focusRing}`}
        >
          取消
        </button>
      </div>

      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') onCancel();
        }}
        placeholder="打卡项名称，如：背单词"
      />

      <div className="flex flex-wrap items-center gap-1.5 text-caption">
        <span className="text-micro opacity-40">重复</span>
        {WEEKDAYS.map((day) => {
          const selected = weekdays.includes(day.value);
          return (
            <Chip
              key={day.value}
              active={selected}
              onClick={() =>
                setWeekdays((current) =>
                  selected
                    ? current.filter((value) => value !== day.value)
                    : [...current, day.value],
                )
              }
            >
              {day.label}
            </Chip>
          );
        })}
        <span className="text-micro opacity-30">不选 = 每天</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-caption opacity-70">
        <label htmlFor="habit-start" className="flex items-center gap-1.5">
          <span>开始</span>
          <div className="w-32">
            <Input
              id="habit-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
        </label>
        <label htmlFor="habit-end" className="flex items-center gap-1.5">
          <span>结束</span>
          <div className="w-32">
            <Input
              id="habit-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <span className="text-micro opacity-50">留空 = 长期</span>
        </label>
      </div>

      {rangeInvalid ? <p className="text-micro text-danger">结束日期不能早于开始日期。</p> : null}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
          {submitLabel}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </Card>
  );
}

interface HistoryGridProps {
  habit: Habit;
  today: string;
  historyFrom: string;
  doneKeys: Set<string>;
}

/**
 * 最近两周的方格，**整块只读**。
 *
 * 两个刻意的限制：
 * 1. 未来不渲染：`habitDatesBetween` 的右端就是今天，压根拿不到未来的日期。
 *    这是渲染层的硬保证——未来还没发生，能提前勾选就等于把"记录"变成"愿望清单"。
 * 2. 过去只读：打卡是对已发生事实的陈述，允许事后补勾/取消，统计就会变成
 *    可以随时修改的数字，连续天数也就失去意义。所以过去的格子用 disabled，
 *    并且在 title 与页脚文案里说明"历史只读"，点击不会静默什么都不发生。
 */
function HistoryGrid({ habit, today, historyFrom, doneKeys }: HistoryGridProps) {
  const dates = habitDatesBetween(habit, historyFrom, today);

  if (dates.length === 0) {
    return <p className="mt-1.5 text-micro opacity-30">最近两周没有安排打卡。</p>;
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {dates.map((date) => {
        const done = doneKeys.has(logKey(habit.id, date));
        const isToday = date === today;
        return (
          <button
            key={date}
            type="button"
            disabled
            aria-disabled="true"
            aria-label={`${date} ${done ? '已打卡' : '未打卡'}`}
            title={`${date}${isToday ? '（今天）' : ''} · ${done ? '已打卡' : '未打卡'} · 历史只读`}
            className={`size-5 cursor-not-allowed rounded-sm border text-micro leading-none tabular-nums ${
              done ? 'border-ink bg-ink text-white' : 'border-line bg-white/60 text-ink/40'
            } ${isToday ? 'ring-1 ring-accent ring-offset-1' : ''}`}
          >
            {Number(date.slice(8, 10))}
          </button>
        );
      })}
      {/* 格子是 disabled 的，点下去不会发生任何事；所以就地写清"只读"，
          而不是让用户点完猜自己是不是点错了。 */}
      <span className="ml-1 text-micro opacity-30">只读</span>
    </div>
  );
}

/**
 * 离线·M2 每日打卡（多打卡项 + 重复规则）。
 *
 * 数据流：`habits` 是"要做什么"（名称 + 周几重复 + 起止日期），
 * `habitLogs` 是"哪天做到了"。某天该不该打卡由纯函数 `isHabitActiveOn` 算出来、
 * 不落库——排期一旦单独存一份，改规则时必然和规则本身不一致。
 * 写入只有一条路径：`setHabitLog(db, habitId, today, done, now)`。
 */
export function CheckinScreen() {
  const today = dateKey(appClock);
  const historyFrom = useMemo(() => addDays(today, -(HISTORY_DAYS - 1)), [today]);
  const logFrom = useMemo(() => addDays(today, -(STREAK_LOOKBACK_DAYS - 1)), [today]);

  const habits = useLiveQuery(() => listHabits(db), [], [] as Habit[]);
  // 右端写死为今天：即使库里有未来的脏记录，界面也不会把它当成"已打过"。
  const logs = useLiveQuery(
    () => listHabitLogs(db, logFrom, today),
    [logFrom, today],
    [] as HabitLog[],
  );

  const doneKeys = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.done) set.add(logKey(log.habitId, log.date));
    }
    return set;
  }, [logs]);

  const dueToday = useMemo(
    () => habits.filter((habit) => isHabitActiveOn(habit, today)),
    [habits, today],
  );
  // 今天轮不到的项也要能看见、能改规则，否则"周一三五"的项在周二就成了隐形数据。
  const idleToday = useMemo(
    () => habits.filter((habit) => !isHabitActiveOn(habit, today)),
    [habits, today],
  );

  /** 展示口径：今天该打卡的项里最长的那条连续天数。 */
  const streak = useMemo(() => {
    let best = 0;
    for (const habit of dueToday) {
      best = Math.max(best, streakOf(habit, doneKeys, today));
    }
    return best;
  }, [dueToday, doneKeys, today]);

  const [formTarget, setFormTarget] = useState<{ habitId: string | null } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const editingId = formTarget?.habitId ?? null;
  const creating = formTarget !== null && formTarget.habitId === null;

  /** 新建时的草稿从"今天开始、每天"起步；编辑时原样回填。 */
  const draftFor = useCallback(
    (habit: Habit | null): HabitDraft =>
      habit === null
        ? { name: '', weekdays: [], startDate: today, endDate: '' }
        : {
            name: habit.name,
            weekdays: [...habit.weekdays],
            startDate: habit.startDate,
            endDate: habit.endDate ?? '',
          },
    [today],
  );

  /**
   * 勾选 / 取消今天。
   *
   * 只有今天走到这里：过去的格子是 disabled，未来的日期不渲染。
   * 时间戳走 clock 而不是 `Date.now()`，和领域约定保持一致。
   */
  const toggleToday = useCallback(
    async (habit: Habit) => {
      const next = !doneKeys.has(logKey(habit.id, today));
      await setHabitLog(db, habit.id, today, next, appClock.now());
    },
    [doneKeys, today],
  );

  const saveDraft = useCallback(
    async (habitId: string | null, draft: HabitDraft) => {
      const now = appClock.now();
      const existing = habitId === null ? undefined : habits.find((item) => item.id === habitId);
      await saveHabit(db, {
        // 编辑保留原 id：日志主键是 `${habitId}@${date}`，换 id 等于把历史全丢掉。
        id: existing?.id ?? newId(),
        name: draft.name.trim(),
        weekdays: [...draft.weekdays].sort((a, b) => a - b),
        startDate: draft.startDate,
        // 空输入统一落成 null，库里只保留一种"长期"的表示。
        endDate: draft.endDate === '' ? null : draft.endDate,
        // order 用当前数量递增，新建排在最后；编辑保留原顺序，改个名字不该跳位。
        order: existing?.order ?? habits.length,
        createdAt: existing?.createdAt ?? now,
      });
      setFormTarget(null);
    },
    [habits],
  );

  const removeHabit = useCallback(async (habit: Habit) => {
    // 仓储在事务里连带清掉 habitLogs：孤儿历史留着没有意义。
    await deleteHabit(db, habit.id);
    setPendingDeleteId(null);
    setFormTarget((current) => (current !== null && current.habitId === habit.id ? null : current));
  }, []);

  const renderRow = (habit: Habit) => {
    const done = doneKeys.has(logKey(habit.id, today));
    // 唯一的"今天能不能写"判据，未来与过去都由它挡在门外。
    const checkable = isHabitCheckableOn(habit, today, today);

    return (
      <li key={habit.id} className="group px-4 py-3">
        {editingId === habit.id ? (
          <HabitFormPanel
            key={habit.id}
            title="编辑打卡项"
            initial={draftFor(habit)}
            submitLabel="保存修改"
            onSubmit={(draft) => void saveDraft(habit.id, draft)}
            onCancel={() => setFormTarget(null)}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Checkbox
                aria-label={`完成 ${habit.name}`}
                checked={done}
                disabled={!checkable}
                onChange={() => void toggleToday(habit)}
                title={checkable ? '勾上表示今天完成了' : '今天不用打卡'}
                className={checkable ? '' : 'cursor-not-allowed opacity-30'}
              />
              <span className="min-w-0 flex-1 break-words text-body">{habit.name}</span>

              {!checkable ? (
                <Badge>今天不用</Badge>
              ) : (
                <span className="text-micro opacity-40">{done ? '已打卡' : '未打卡'}</span>
              )}

              <span className="text-micro tabular-nums opacity-30">{describeSchedule(habit)}</span>

              {/* 触屏没有 hover，小屏常显操作，桌面悬停出现（沿用作业清单的做法）。 */}
              <span className="flex items-center gap-1 opacity-100 transition-opacity duration-fast sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setPendingDeleteId(null);
                    setFormTarget({ habitId: habit.id });
                  }}
                  className={`px-1 text-small opacity-50 transition-opacity duration-fast hover:opacity-80 ${focusRing}`}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(habit.id)}
                  className={`px-1 text-small opacity-50 transition-opacity duration-fast hover:opacity-80 ${focusRing}`}
                >
                  删除
                </button>
              </span>
            </div>

            <HistoryGrid
              habit={habit}
              today={today}
              historyFrom={historyFrom}
              doneKeys={doneKeys}
            />

            {pendingDeleteId === habit.id ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-caption text-danger">
                <span>删除「{habit.name}」会连它的全部历史打卡一起删掉，无法恢复。确定？</span>
                <Button variant="danger" size="sm" onClick={() => void removeHabit(habit)}>
                  确认删除
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>
                  取消
                </Button>
              </p>
            ) : null}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <span className="flex items-baseline gap-2">
          <span className="text-metric font-semibold tabular-nums">{streak}</span>
          <span className="text-body opacity-50">天最长连续</span>
        </span>
        <span className="text-small tabular-nums opacity-40">今天 {today}</span>
        <span className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setPendingDeleteId(null);
            setFormTarget({ habitId: null });
          }}
        >
          新建打卡项
        </Button>
      </div>

      {creating ? (
        <HabitFormPanel
          key="new"
          title="新建打卡项"
          initial={draftFor(null)}
          submitLabel="保存"
          onSubmit={(draft) => void saveDraft(null, draft)}
          onCancel={() => setFormTarget(null)}
        />
      ) : null}

      <Section title="今天该打卡">
        {dueToday.length === 0 ? (
          <EmptyState size="md">今天没有要打卡的项。用右上角「新建打卡项」加一项。</EmptyState>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">{dueToday.map((habit) => renderRow(habit))}</ul>
          </Card>
        )}
      </Section>

      {idleToday.length > 0 ? (
        <Section
          title="今天不用打卡"
          description="这些项的重复规则不含今天（或在起止日期之外），只能看历史、改规则。"
        >
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-line">{idleToday.map((habit) => renderRow(habit))}</ul>
          </Card>
        </Section>
      ) : null}

      <p className="text-caption leading-relaxed opacity-35">
        方格是最近 {HISTORY_DAYS} 天的历史，只读：打卡记录的是"我做到了"，
        允许回头补勾或取消，统计就成了可以随时改写的数字。今天能不能打只看今天——
        未来还没发生，所以不渲染、也不允许提前勾。连续天数取「今天该打卡的项里最长的一条」：
        从今天往回数，只数这项排期内的日子，哪天没打就断在那一格。
      </p>
    </div>
  );
}
