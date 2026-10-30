/**
 * 日期展示的小工具。
 *
 * 单独放一个文件是因为两个地方都要用：打印层（标题里的日期）和扫描重建坐标
 * （按纸上日期重新物化模板）。跨屏幕 import 会把组件依赖绕成环，所以抽出来。
 */

/** 把 `YYYY-MM-DD` 变成纸面标题用的中文日期。 */
export function todayLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}
