/**
 * P1 冒烟测试：真实浏览器跑一遍「导航 → 数据 → 版式 → 打印」。
 *
 * 用法：pnpm build && pnpm e2e
 * 会自动起一个 preview 服务、跑完、再关掉。
 *
 * 为什么必须用真实浏览器：IndexedDB、打印 CSS、全屏遮罩、二次确认
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

  /* ---------------------------------------------------------- 导航与首页 */

  await page.waitForSelector('text=拍照录入', { timeout: 15000 });
  check('首页两个主行动', (await page.getByText('打印 checklist').count()) > 0);

  const groups = await page.locator('aside button[aria-expanded]').count();
  check('侧栏 6 个模块分组', groups === 6, `实际 ${groups}`);

  /* -------------------------------------------------------------- 作业清单 */

  await openGroup(page, '记录');
  await clickItem(page, '作业清单');
  await page.waitForSelector('input[placeholder="加一项作业，回车确认"]', { timeout: 5000 });
  check('可导航到作业清单', true, '离线·M2');

  await page.fill('input[placeholder="加一项作业，回车确认"]', '数学卷子 3.1');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=数学卷子 3.1', { timeout: 5000 });
  check('新增任务', true);

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

  // 留一条未完成任务，后面验证首页复选框
  await page.fill('input[placeholder="加一项作业，回车确认"]', '英语听力 Unit 4');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=英语听力 Unit 4', { timeout: 5000 });

  // 标签池（常驻池是科目）
  check('作业页有标签管理', (await page.getByText('标签管理').count()) > 0);

  /* -------------------------------------------------------- 未实现条目 */

  await openGroup(page, '工具');
  await clickItem(page, '笔记本');
  await page.waitForSelector('text=此条目属于产品', { timeout: 5000 });
  check('未实现条目给出阶段说明', true);

  /* -------------------------------------------------------------- 番茄钟 */

  await openGroup(page, '工具');
  await clickItem(page, '番茄钟');
  await page.locator('input[type="number"]').first().fill('30');
  await page
    .getByRole('button', { name: /开始专注 30 分钟/ })
    .first()
    .click();
  await page.waitForSelector('text=/\\d{2}:\\d{2}/', { timeout: 5000 });
  check('番茄钟支持自定义时长并进入专注', true);

  await page.getByRole('button', { name: '暂停' }).first().click();
  await page.waitForSelector('text=已暂停', { timeout: 5000 });
  check('番茄钟可暂停', true);

  await page.getByRole('button', { name: '放弃' }).first().click();
  await page.getByRole('button', { name: '确认放弃？' }).first().click();
  await page.waitForSelector('text=自定义', { timeout: 5000 });
  check('放弃需要二次确认', true);

  /* -------------------------------------------------------------- 每日打卡 */

  await openGroup(page, '记录');
  await clickItem(page, '每日打卡');
  await page.waitForSelector('text=天连续', { timeout: 5000 });
  await page.locator('button[aria-label$="打卡"]').first().click();
  await sleep(400);
  await page.reload({ waitUntil: 'networkidle' });
  await openGroup(page, '记录');
  await clickItem(page, '每日打卡');
  await page.waitForSelector('text=天连续', { timeout: 5000 });
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

  /* -------------------------------------------------------------- 课程表 */

  await openGroup(page, '记录');
  await clickItem(page, '课程表');
  await page.waitForSelector('[data-testid="week-grid"]', { timeout: 8000 });

  await page.fill('input[placeholder="科目名，如 数学"]', '地理');
  await page.getByRole('button', { name: '加科目' }).click();
  await page.getByText('地理', { exact: true }).first().waitFor({ timeout: 5000 });
  check('课表可新增全局科目', true);

  await page.getByRole('button', { name: '加规则' }).click();
  await page
    .locator('[data-testid="week-grid"]')
    .getByText('语文', { exact: false })
    .first()
    .waitFor({ timeout: 5000 });
  check('课程表可录入并在周视图显示', true);

  await page.getByRole('button', { name: '保存课表' }).click();
  await page.waitForSelector('text=已保存', { timeout: 5000 });
  check('课表可保存', true);

  /* ------------------------------------------------------ 模板与校准页 */

  await openGroup(page, '导出');
  await clickItem(page, '模板与校准页');
  await page.getByRole('button', { name: '打印校准页' }).click();
  await page.waitForSelector('text=每台打印机第一次使用前', { timeout: 5000 });
  check('模板编辑器与校准页可打开', true);

  await page.getByRole('button', { name: '我的一天' }).click();
  const missing = [];
  for (const size of ['A4', 'A6', 'B5 (JIS)', 'Letter']) {
    if ((await page.getByRole('button', { name: size, exact: true }).count()) === 0) {
      missing.push(size);
    }
  }
  check('模板支持更多纸张尺寸', missing.length === 0, missing.length ? `缺 ${missing}` : '');

  /* ---------------------------------------------------- 首页任务提示可勾选 */

  await page.getByRole('button', { name: 'GoFor', exact: true }).click();
  await page.waitForSelector('text=任务提示', { timeout: 5000 });
  // 注意：应用外壳的根是 div.screen-only，不是 <main>；用 aria-label 定位更稳
  const homeBoxes = page.locator('input[aria-label^="完成 "]');
  const before = await homeBoxes.count();
  check('首页显示未完成任务', before > 0, `未完成 ${before} 条`);
  if (before > 0) {
    await homeBoxes.first().click();
    const removed = await page
      .waitForFunction(
        (n) => document.querySelectorAll('input[aria-label^="完成 "]').length < n,
        before,
        { timeout: 5000 },
      )
      .then(() => true)
      .catch(() => false);
    check('首页任务提示可勾选', removed);
  }

  /* ------------------------------------------------------------ 打印 */

  await openGroup(page, '导出');
  await clickItem(page, '打印 checklist');
  await page.waitForSelector('text=/共 \\d+ 页/', { timeout: 5000 });
  const pageInfo = await page.locator('text=/共 \\d+ 页/').first().innerText();
  check('默认 A4 一页装下（含当日课表）', pageInfo.includes('共 1 页'), pageInfo);

  /* ------------------------------------------------------ 命令面板与 PDF */

  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[placeholder="输入命令…"]', { timeout: 5000 });
  check('命令面板可唤起', true);
  await page.keyboard.press('Escape');

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
