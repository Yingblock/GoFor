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
import { readFile } from 'node:fs/promises';
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

/**
 * 起一个 preview 服务。
 *
 * `detached: true` 是为了让整个进程组成一个独立的进程组：
 * `server.kill()` 只能杀掉 `pnpm`，它下面的 `vite preview` 会被留下——以前每跑一次
 * e2e 就漏一个 4173 上的服务，下一次 e2e 会连上那个**旧构建**的服务并照样"全绿"，
 * 变成假绿。所以这里按进程组清，并且开跑前先查端口。
 */
const server = spawn(
  'pnpm',
  ['--filter', '@gofor/web', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', detached: true },
);

/** 端口上已经有人应答了（说明有遗留服务，绝不能连上去）。 */
async function portAlreadyServing() {
  try {
    const response = await fetch(BASE);
    return response.ok;
  } catch {
    return false;
  }
}

/** 按进程组清掉 preview；单杀 pnpm 会留下 vite 孤儿进程。 */
async function stopServer() {
  if (server.pid === undefined) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // 已经退出了
  }
  await sleep(300);
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    // 同上：SIGTERM 就够了
  }
}

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
  if (await portAlreadyServing()) {
    throw new Error(
      `端口 ${PORT} 已被占用（多半是上次 e2e 留下的 preview）。先结束它再跑，` +
        '否则会连到旧构建上，测出来的"全绿"是假的。',
    );
  }
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

  // 全新浏览器上下文里没有 gofor.backup.lastAt，首次打开必须看到备份提醒。
  const backupBanner = page.locator('[data-testid="backup-banner"]');
  await backupBanner.waitFor({ timeout: 5000 });
  check('首次打开显示备份提醒', (await backupBanner.getByText('数据只在这台设备上').count()) > 0);

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

  /*
   * 添加栏标签：选一次之后连续录入不再清空（用户要求）。
   * 不只是断言按钮上的计数——第二条任务必须真的带上标签，
   * 否则"界面没清空、数据却没写进去"这种情况会被漏掉。
   */
  const addTagButton = page.locator('button[aria-label="添加栏标签"]');
  await addTagButton.click();
  await page.locator('button[aria-pressed]').filter({ hasText: '数学' }).first().click();
  check('添加栏可选标签', (await addTagButton.innerText()).includes('· 1'));

  await page.fill('input[placeholder="加一项作业，回车确认"]', '物理实验报告');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=物理实验报告', { timeout: 5000 });
  check('新建任务后标签不清空', (await addTagButton.innerText()).includes('· 1'));

  await page.fill('input[placeholder="加一项作业，回车确认"]', '化学方程式');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=化学方程式', { timeout: 5000 });
  const chemRow = page.locator('li').filter({ hasText: '化学方程式' }).first();
  check('新任务继承已选标签', (await chemRow.getByText('数学', { exact: true }).count()) > 0);

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
  // 侧栏「调试 · 当前时间」里的 `YYYY-MM-DD HH:mm` 也含 `\d{2}:\d{2}`，
  // 而它在收起的 <details> 里不可见：裸正则先命中的是它，会一直等可见性。
  // 锚定整串，只命中这个倒计时。
  await page.waitForSelector('text=/^\\d{2}:\\d{2}$/', { timeout: 5000 });
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
  await page.waitForSelector('text=新建打卡项', { timeout: 5000 });

  await page.getByRole('button', { name: '新建打卡项' }).first().click();
  await page.fill('input[placeholder="打卡项名称，如：背单词"]', '背单词');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForSelector('input[aria-label="完成 背单词"]', { timeout: 5000 });
  check('可新建打卡项', true);

  await page.locator('input[aria-label="完成 背单词"]').click();
  await sleep(400);

  // 历史格子必须是只读的（未来不渲染、过去 disabled）
  const readOnly = await page.locator('button[aria-disabled="true"]').count();
  check('历史格子只读', readOnly > 0, `${readOnly} 个`);

  await page.reload({ waitUntil: 'networkidle' });
  await openGroup(page, '记录');
  await clickItem(page, '每日打卡');
  await page.waitForSelector('input[aria-label="完成 背单词"]', { timeout: 8000 });
  const persisted = await page
    .waitForFunction(
      () => document.querySelector('input[aria-label="完成 背单词"]')?.checked === true,
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

  /*
   * 编辑模式：点空白格子加课 → 课程块出现在周视图 → 点块删除 → 块消失。
   * 这条链路是课表拆分时搬动最多的逻辑（浮层定位、占格判断、增删规则），
   * 单测只能覆盖纯函数，真实的点击/浮层必须由浏览器兜。
   */
  await page.getByRole('button', { name: '编辑模式' }).click();
  await page.waitForSelector('text=点空白格子加课', { timeout: 5000 });
  await page.locator('button[aria-label="周日 第 8 节加课"]').click();
  const addDialog = page.getByRole('dialog', { name: '编辑格子' });
  await addDialog.waitFor({ timeout: 5000 });
  await addDialog.getByRole('button', { name: '地理', exact: true }).click();

  const weekGrid = page.locator('[data-testid="week-grid"]');
  const addedByCell = await weekGrid
    .getByText('地理', { exact: true })
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check('编辑模式点格子可加课', addedByCell);

  await weekGrid.getByRole('button', { name: '地理' }).first().click();
  await page
    .getByRole('dialog', { name: '编辑格子' })
    .getByRole('button', { name: '删除这节' })
    .click();
  const removedByCell = await weekGrid
    .getByText('地理', { exact: true })
    .first()
    .waitFor({ state: 'detached', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check('编辑模式可删除这一节', removedByCell);
  await page.getByRole('button', { name: '退出编辑' }).click();

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

  // 首页新增的两个区块。今天有没有课随星期变化（周末没有），
  // 所以只断言区块在，不断言列了几行。
  check('首页有今日课表区块', (await page.getByText('今日课表').count()) > 0);
  check('首页有打卡提示区块', (await page.getByText('打卡提示').count()) > 0);

  /* ------------------------------------------------------------ 打印 */

  await openGroup(page, '导出');
  await clickItem(page, '打印 checklist');
  await page.waitForSelector('text=/共 \\d+ 页/', { timeout: 5000 });
  const pageInfo = await page.locator('text=/共 \\d+ 页/').first().innerText();
  check('默认 A4 一页装下（含当日课表）', pageInfo.includes('共 1 页'), pageInfo);
  check(
    '纸面包含当日课表区块',
    (await page.getByText('今日课表').count()) > 0,
    '（今天可能无课，但区块必须存在）',
  );

  /* ------------------------------------------------------ 命令面板与 PDF */

  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[placeholder="输入命令…"]', { timeout: 5000 });
  check('命令面板可唤起', true);
  await page.keyboard.press('Escape');

  /* ------------------------------------------------ 备份导出与导入往返 */

  // 回到首页，横幅应该还在（这一轮从未备份过）。
  await page.getByRole('button', { name: 'GoFor', exact: true }).click();
  await backupBanner.waitFor({ timeout: 5000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '立即备份' }).click();
  const download = await downloadPromise;
  const backupName = download.suggestedFilename();
  check('一键备份触发下载', /^gofor-backup-\d{4}-\d{2}-\d{2}\.json$/.test(backupName), backupName);

  // 下载出来的文件必须能当备份用：合法 JSON + GoFor 导出结构。
  const downloadPath = await download.path();
  const backupText = downloadPath ? await readFile(downloadPath, 'utf8') : '';
  let bundle = null;
  try {
    bundle = JSON.parse(backupText);
  } catch {
    bundle = null;
  }
  check(
    '备份文件是合法 JSON',
    bundle !== null &&
      bundle.format === 'gofor-export' &&
      typeof bundle.formatVersion === 'number' &&
      Array.isArray(bundle.subjects) &&
      Array.isArray(bundle.tasks) &&
      Array.isArray(bundle.sessions) &&
      Array.isArray(bundle.templates),
    bundle ? `formatVersion=${bundle.formatVersion}` : 'JSON 解析失败',
  );

  /*
   * 备份必须是"全量"：漏一张表就是"备份成功、恢复少一半数据"，而用户看不出来。
   * 这几张表曾经真的漏在 exportAll 外面（打卡 / 课表 / 标签池 / 番茄运行）。
   */
  check(
    '备份包含全部会持久化的表',
    bundle !== null &&
      Array.isArray(bundle.habits) &&
      Array.isArray(bundle.habitLogs) &&
      Array.isArray(bundle.timetables) &&
      Array.isArray(bundle.tagPools) &&
      Array.isArray(bundle.focusRuns),
    bundle
      ? `habits=${bundle.habits?.length} timetables=${bundle.timetables?.length} tagPools=${bundle.tagPools?.length}`
      : 'JSON 解析失败',
  );

  const lastBackup = await page.evaluate(() => localStorage.getItem('gofor.backup.lastAt'));
  check('备份写入 lastAt', lastBackup !== null && Number.isFinite(Number(lastBackup)));

  // 给用户的结果提示出现后，横幅自动收起。
  await page.waitForSelector('text=/已备份 \\d+ 个任务/', { timeout: 5000 });
  check('备份后显示备份结果', true);
  const bannerGone = await backupBanner
    .waitFor({ state: 'detached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('备份成功后横幅消失', bannerGone);

  // 用刚下载的文件走一遍真实导入：同 id 覆盖、不同 id 追加，提示里要有任务数。
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'gofor-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await page.waitForSelector('text=/已导入 \\d+ 个任务/', { timeout: 8000 });
  check('导出文件可再导入', true);

  // 坏文件必须给出提示，而不是白屏或整页崩溃。
  await fileInput.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ 这不是 JSON'),
  });
  await page.waitForSelector('text=/导入失败/', { timeout: 8000 });
  check('非法 JSON 提示导入失败', true);

  /* ------------------------------------------------------ 打印 PDF */

  await page.pdf({
    path: 'e2e/out/day-sheet.pdf',
    printBackground: true,
    preferCSSPageSize: true,
  });
  check('能导出打印 PDF', true, 'e2e/out/day-sheet.pdf');

  check('无运行时报错', errors.length === 0, errors.join(' | '));

  await browser.close();
} finally {
  await stopServer();
}

console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
