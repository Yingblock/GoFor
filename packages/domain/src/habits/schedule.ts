/**
 * 打卡项的排期（纯逻辑）。
 *
 * 一个打卡项 = 名字 + 重复规则（周几）+ 起止日期。
 * 拆成纯函数是因为"某天该不该打卡"要被三个地方用：
 * 今日列表、历史网格、以及（将来）统计。
 */

export interface Habit {
  id: string;
  name: string;
  /** 1=周一 … 7=周日；空数组表示每天。 */
  weekdays: number[];
  /** 开始日期 'YYYY-MM-DD'，含。 */
  startDate: string;
  /** 结束日期，null 表示长期。 */
  endDate: string | null;
  order: number;
  createdAt: number;
}

/** 'YYYY-MM-DD' → ISO 星期（1=周一…7=周日）。走 UTC，避免时区偏移。 */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** 这一天该不该打卡。 */
export function isHabitActiveOn(habit: Habit, date: string): boolean {
  if (date < habit.startDate) return false;
  if (habit.endDate !== null && date > habit.endDate) return false;
  if (habit.weekdays.length === 0) return true;
  return habit.weekdays.includes(isoWeekday(date));
}

/** 闭区间内该打卡的所有日期（升序）。 */
export function habitDatesBetween(habit: Habit, from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  // 上限保护：即使调用方传了荒谬的区间也不会死循环
  for (let guard = 0; guard < 3660 && cursor <= to; guard += 1) {
    if (isHabitActiveOn(habit, cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** 'YYYY-MM-DD' 加减天数。 */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 打卡只能记录到今天。
 *
 * 为什么不允许打未来：打卡是"我做过这件事"的陈述，未来还没发生，
 * 允许提前勾选只会让数据变成愿望清单，统计也就失去意义。
 */
export function isHabitCheckableOn(habit: Habit, date: string, today: string): boolean {
  return date <= today && isHabitActiveOn(habit, date);
}
