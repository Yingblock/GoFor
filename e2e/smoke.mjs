/**
 * P0 冒烟测试：真实浏览器跑一遍「导航 → 数据 → 版式 → 打印」。
 *
 * 用法：pnpm build && pnpm e2e
 * 会自动起一个 preview 服务、跑完、再关掉。
 *
 * 为什么必须用真实浏览器：IndexedDB、Service Worker、打印 CSS
 * 在 Node 里都测不出来。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
let failed = false;

function check(name, ok, detail = '') {
  results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

const server = spawn(
  'pnpm',
  ['--filter', '@gofor/web', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
);

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return true;
    } catch {
      // 还没起来，继续等
    }
    await sleep(250);
  }
  return false;
}

/** 展开某个模块分组（已展开则不点，否则会把它收起来）。 */
async function openGroup(page, title) {
  const button = page.locator('aside button[aria-expanded]').filter({ hasText: title }).first();
  const expanded = await button.getAttribute('aria-expanded');
  if (expanded !== 'true') await button.click();
}

/** 点击分组下的条目。 */
async function clickItem(page, title) {
  await page.locator('aside button').filter({ hasText: title }).first().click();
}

try {
  if (!(await waitForServer())) throw new Error('preview 服务未启动，先跑 pnpm build');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // 1) 首页：顶部两个主行动
  await page.waitForSelector('text=拍照录入', { timeout: 15000 });
  check('首页两个主行动', (await page.getByText('打印 checklist').count()) > 0);

  // 2) 侧栏按模块编码分组
  const groups = await page.locator('aside button[aria-expanded]').count();
  check('侧栏 6 个模块分组', groups === 6, `实际 ${groups}`);

  // 3) 导航到 P1·M2 → 作业清单
  await openGroup(page, '记录');
  await clickItem(page, '作业清单');
  await page.waitForSelector('input[placeholder="加一项作业，回车确认"]', { timeout: 5000 });
  check('可导航到作业清单', true, 'P1·M2');

  // 4) 新增任务
  await page.fill('input[placeholder="加一项作业，回车确认"]', '数学卷子 3.1');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=数学卷子 3.1', { timeout: 5000 });
  check('新增任务', true);

  // 5) 勾选完成并刷新（IndexedDB 持久化）
  await page.locator('input[aria-label="完成 数学卷子 3.1"]').click();
  await sleep(500);
  await page.reload({ waitUntil: 'networkidle' });
  await openGroup(page, '记录');
  await clickItem(page, '作业清单');
  await page.waitForSelector('text=数学卷子 3.1', { timeout: 8000 });
  check('刷新后任务仍在', true);
  check(
    '刷新后完成状态仍在',
    await page.locator('input[aria-label="完成 数学卷子 3.1"]').isChecked(),
  );

  // 6) 未实现的条目给出阶段说明（不是死链）——用尚未实现的「笔记本」
  await openGroup(page, '工具');
  await clickItem(page, '笔记本');
  await page.waitForSelector('text=此条目属于阶段', { timeout: 5000 });
  check('未实现条目给出阶段说明', true);

  // 7) 番茄钟：能开始、能暂停
  await openGroup(page, '工具');
  await clickItem(page, '番茄钟');
  await page.getByRole('button', { name: /开始专注/ }).first().click();
  await page.waitForSelector('text=/\\d{2}:\\d{2}/', { timeout: 5000 });
  await page.getByRole('button', { name: '暂停' }).first().click();
  await page.waitForSelector('text=已暂停', { timeout: 5000 });
  check('番茄钟可开始并暂停', true);
  await page.getByRole('button', { name: '放弃' }).first().click();

  // 8) 每日打卡：勾选后刷新仍在
  await openGroup(page, '记录');
  await clickItem(page, '每日打卡');
  await page.waitForSelector('text=天连续', { timeout: 5000 });
  const todayCell = page.locator('button[aria-label$="打卡"]').first();
  await todayCell.click();
  await sleep(400);
  await page.reload({ waitUntil: 'networkidle' });
  await openGroup(page, '记录');
  await clickItem(page, '每日打卡');
  await page.waitForSelector('text=天连续', { timeout: 5000 });
  // liveQuery 是异步的，"天连续" 出现时数据可能还没到，必须等条件成立
  const persisted = await page
    .waitForFunction(
      () => {
        const cell = document.querySelector('button[aria-label$="打卡"]');
        return cell?.className.includes('bg-[var(--color-ink)]') ?? false;
      },
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check('打卡可勾选并持久化', persisted);

  // 9) 打印页：A4 一页装下
  await openGroup(page, '导出');
  await clickItem(page, '打印 checklist');
  await page.waitForSelector('text=/共 \\d+ 页/', { timeout: 5000 });
  const pageInfo = await page.locator('text=/共 \\d+ 页/').first().innerText();
  check('默认 A4 一页装下', pageInfo.includes('共 1 页'), pageInfo);

  // 10) 命令面板
  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[placeholder="输入命令…"]', { timeout: 5000 });
  check('命令面板可唤起', true);
  await page.keyboard.press('Escape');

  // 这一张就是能带去学校的纸
  await page.pdf({
    path: 'e2e/out/day-sheet.pdf',
    printBackground: true,
    preferCSSPageSize: true,
  });
  check('能导出打印 PDF', true, 'e2e/out/day-sheet.pdf');

  check('无运行时报错', errors.length === 0, errors.join(' | '));

  await browser.close();
} finally {
  server.kill('SIGTERM');
}

console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
