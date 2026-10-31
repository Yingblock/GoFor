import { chromium } from 'playwright';

/** 外部插件迁移 smoke：需要 plugin-host 已启动，外部插件已安装。 */
const BASE = 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(`${BASE}/?external=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const blocks = await page
  .locator('section[aria-label]')
  .evaluateAll((sections) => sections.map((section) => section.getAttribute('aria-label')));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

check('外部首页内容块', blocks.includes('作业清单') && blocks.includes('学习统计'), blocks.join(' > '));
check('外部插件侧栏页面', (await page.locator('aside').getByText('作业清单').count()) > 0);
check('core 纸面闭环仍在', blocks.includes('纸面闭环'));

await page.evaluate(() => {
  location.hash = '#/s/gofor.tasks/screen';
});
await page.waitForTimeout(700);
const taskInput = page.locator('input[placeholder*="任务"], input[placeholder*="作业"]').first();
if ((await taskInput.count()) > 0) {
  await taskInput.fill('外部插件任务');
  await taskInput.press('Enter');
  await page.waitForTimeout(600);
}
check('外部任务页可写数据', (await page.locator('body').innerText()).includes('外部插件任务'));

await page.evaluate(() => {
  location.hash = '#/s/home';
});
await page.waitForTimeout(600);
check('外部任务数据出现在首页', (await page.locator('body').innerText()).includes('外部插件任务'));

await page.evaluate(() => {
  location.hash = '#/s/gofor.report/screen';
});
await page.waitForTimeout(700);
check('外部周报页可读数据', (await page.locator('body').innerText()).includes('自我周报'));

await page.evaluate(() => {
  location.hash = '#/s/print';
});
await page.waitForTimeout(700);
check('打印页可打开', (await page.locator('body').innerText()).includes('打印'));

check('无运行时报错', errors.length === 0, errors.join(' | '));
await browser.close();

let failed = 0;
for (const result of checks) {
  if (!result.ok) failed += 1;
  console.log(`${result.ok ? '✓' : '✗'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
}
if (failed > 0) process.exit(1);
