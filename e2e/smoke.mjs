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

// e2e 用独立端口：4173 留给用户正在使用的应用实例（同一 origin 数据才不会丢）。
const PORT = 4313;
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

  // 放弃改成「长按 5 秒」：先验证中途松开不生效，再按住满 5 秒。
  const abandonButton = page.getByRole('button', { name: '长按 5 秒放弃本次专注' });
  await abandonButton.hover();
  const abandonBox = await abandonButton.boundingBox();
  if (abandonBox === null) throw new Error('拿不到放弃按钮的位置');
  await page.mouse.move(abandonBox.x + abandonBox.width / 2, abandonBox.y + abandonBox.height / 2);
  await page.mouse.down();
  await sleep(1500);
  await page.mouse.up();
  await sleep(400);
  check('放弃：中途松开不生效', (await abandonButton.count()) > 0);
  await page.mouse.down();
  await sleep(5400);
  await page.mouse.up();
  await page.waitForSelector('text=自定义', { timeout: 5000 });
  check('放弃：长按 5 秒生效', true);

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

  // 默认规则只排周一；e2e 的「课程备注」用例要求今天有课，否则备注输入框不渲染。
  // 先把规则改到今天（周日按钮显示「日」），再做其余断言。
  const weekdayChar = ['一', '二', '三', '四', '五', '六', '日'][(new Date().getDay() + 6) % 7];
  if (weekdayChar !== '一') {
    await page.locator('button[aria-pressed]').filter({ hasText: weekdayChar }).first().click();
  }

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

  // P2 之后课表改成自动保存：改完停手 600ms 就会写库，不需要再点保存。
  await page.waitForSelector('text=/已自动保存/', { timeout: 10000 });
  check('课表自动保存', true);

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

  // 课程备注（P2-2.15）：首页课表行可以直接写备注，打印页应印在科目名后面。
  let noteWritten = false;
  const noteInputs = page.locator('input[aria-label$="备注"]');
  if ((await noteInputs.count()) > 0) {
    await noteInputs.first().fill('带错题本');
    await noteInputs.first().press('Enter');
    await sleep(400);
    const shortWidth = (await noteInputs.first().boundingBox())?.width ?? 0;

    // 备注框要随文字变长，但不能挤占整行；长文本到上限后裁断。
    await noteInputs.first().fill('这是一条很长的课程备注，用来确认输入框会随文字长度自动变宽');
    await noteInputs.first().press('Enter');
    await sleep(400);
    const longWidth = (await noteInputs.first().boundingBox())?.width ?? 0;
    check('课程备注框随文字变长', longWidth > shortWidth + 4, `${shortWidth}px → ${longWidth}px`);

    // 备注变长时不能把同一行的科目名/结束时间挤没：
    // 科目名 min-w-16（64px）且溢出省略，结束时间 shrink-0 固定在最右。
    const noteRow = noteInputs.first().locator('xpath=ancestor::li');
    const rowBox = await noteRow.boundingBox();
    const labelBox = await noteRow.locator('span').nth(1).boundingBox();
    const endSpan = noteRow.locator('span').last();
    const endBox = await endSpan.boundingBox();
    const endText = (await endSpan.innerText()).trim();
    check(
      '长备注不挤掉科目名',
      (labelBox?.width ?? 0) >= 60,
      `${Math.round(labelBox?.width ?? 0)}px（下限 64px）`,
    );
    check(
      '长备注不顶掉结束时间',
      !!endBox &&
        endBox.width > 0 &&
        /– \d{2}:\d{2}/.test(endText) &&
        endBox.x + endBox.width <= (rowBox?.x ?? 0) + (rowBox?.width ?? 0) + 1,
      `${endText} 右缘 ${Math.round((endBox?.x ?? 0) + (endBox?.width ?? 0))}`,
    );

    // 恢复短备注，后面的打印断言用这一条。
    await noteInputs.first().fill('带错题本');
    await noteInputs.first().press('Enter');
    await sleep(400);
    noteWritten = true;
  }
  check('首页课表行可写备注', noteWritten, noteWritten ? '' : '今天没有课，跳过');

  /* ------------------------------------------------------------ 打印 */

  await openGroup(page, '导出');
  await clickItem(page, '打印 checklist');
  await page.waitForSelector('text=/共 \\d+ 页/', { timeout: 5000 });

  // P2-2.18：单张打印默认「明天」；e2e 的扫描链路用的是今天的纸，先切回今天。
  const todayKey = new Date().toLocaleDateString('sv-SE');
  const tomorrowKey = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE');
  const printDateInput = page.getByLabel('打印日期');
  check(
    '打印页默认日期是明天',
    (await printDateInput.inputValue()) === tomorrowKey,
    await printDateInput.inputValue(),
  );
  check('批量范围控件存在', (await page.getByLabel('范围天数滑动条').count()) > 0);
  await page.getByLabel('范围天数', { exact: true }).fill('32');
  check('范围超过 31 天有提示', (await page.getByText('一次打印很多天？').count()) > 0);
  await page.getByRole('button', { name: '取消' }).click();

  // 改结束日期 → 天数实时重算（开始/结束/天数/滑动条联动）
  const plusDays = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().slice(0, 10);
  };
  await page.getByLabel('范围结束').fill(plusDays(todayKey, 2));
  check(
    '改结束日期会实时重算天数',
    (await page.getByLabel('范围天数', { exact: true }).inputValue()) === '2',
  );
  await page.getByLabel('范围结束').fill(todayKey);
  await printDateInput.fill(todayKey);
  await sleep(300);

  const pageInfo = await page.locator('text=/共 \\d+ 页/').first().innerText();
  check('默认 A4 一页装下（含当日课表）', pageInfo.includes('共 1 页'), pageInfo);
  check(
    '纸面包含当日课表区块',
    (await page.getByText('今日课表').count()) > 0,
    '（今天可能无课，但区块必须存在）',
  );

  // P2-2.17：每页四角印 3mm 定位块，扫描端据此自动框选。
  const fiducials = await page.locator('.print-page').first().locator('[data-fiducial]').count();
  check('纸面四角有定位块', fiducials === 4, `${fiducials} 个`);

  // 打卡行（P2-2.13）：e2e 前面已经建了「背单词」，默认 A4 模板要把它印出来。
  const printedHabit = await page.locator('.print-page').first().getByText('背单词').count();
  check('纸面包含打卡行', printedHabit > 0);

  if (noteWritten) {
    const printedNote = await page.locator('.print-page').first().getByText('带错题本').count();
    check('课程备注印在纸面上', printedNote > 0);
  }

  /* ------------------------------------------------------ 命令面板与 PDF */

  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[placeholder="输入命令…"]', { timeout: 5000 });
  check('命令面板可唤起', true);
  await page.keyboard.press('Escape');

  /* -------------------------------------------------- P2：行为层五屏 */

  await openGroup(page, '工具');
  await clickItem(page, '环境清单');
  await page.waitForSelector('text=环境隔离清单', { timeout: 8000 });
  check('环境清单可打开', true);

  await openGroup(page, '记录');
  await clickItem(page, '三格自评');
  await page.waitForSelector('text=今天的三格', { timeout: 8000 });
  check('三格自评可打开', true);

  await openGroup(page, '记录');
  await clickItem(page, '自我周报');
  await page.waitForSelector('text=自我周报', { timeout: 8000 });
  check('自我周报可打开', true);

  await openGroup(page, '心理支持');
  await clickItem(page, '自助工具箱');
  await page.waitForSelector('text=四个短练习', { timeout: 8000 });
  check('自助工具箱可打开', true);

  await openGroup(page, '心理支持');
  await clickItem(page, '情绪日记');
  await page.waitForSelector('text=写今天的', { timeout: 8000 });
  check('情绪日记可打开', true);

  /* -------------------------------------------------- P2：侧栏可折叠 */

  const collapseButton = page.getByRole('button', { name: '折叠侧栏' });
  check('桌面端有侧栏折叠按钮', (await collapseButton.count()) > 0);
  if ((await collapseButton.count()) > 0) {
    await collapseButton.click();
    const sidebarClass = (await page.locator('aside').first().getAttribute('class')) ?? '';
    check('折叠后侧栏收成图标列', sidebarClass.includes('md:w-14'));
    // 折叠态下仍然能导航（图标可点）
    await page.locator('aside').first().getByRole('button', { name: '作业清单' }).click();
    await page.waitForSelector('input[placeholder="加一项作业，回车确认"]', { timeout: 8000 });
    check('折叠态仍可导航', true);
    await page.getByRole('button', { name: '展开侧栏' }).click();
  }

  /* ------------------------------------------- P2：拍照 → 识别 → 回填 */

  // 把「打印预览的那一页」截图当照片。预览是缩小显示的，直接截会只有 29px 的二维码、
  // 解不出来——所以另开一个 4 倍像素密度的页面来截，像素量接近手机拍的照片。
  // 这样 e2e 不需要提交测试图片，也不依赖摄像头。
  const photoPage = await browser.newPage({
    viewport: { width: 1100, height: 1400 },
    deviceScaleFactor: 4,
  });
  await photoPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await openGroup(photoPage, '导出');
  await clickItem(photoPage, '打印 checklist');
  await photoPage.waitForSelector('.print-page', { timeout: 10000 });
  // 打印页默认明天；扫描用例验的是今天的纸，先切到今天。
  await photoPage.getByLabel('打印日期').fill(new Date().toLocaleDateString('sv-SE'));
  await photoPage.waitForTimeout(300);
  const sheetPng = await photoPage.locator('.print-page').first().screenshot();

  // 再截一张"二维码被挡住"的同一页：验证页尾条码兜底（P2-2.12）。
  // 只隐藏二维码 svg，条码与版式不动，等价于"码被裁出画面/反光"。
  await photoPage.evaluate(() => {
    for (const node of document.querySelectorAll('[aria-label="回填二维码"]')) {
      node.style.display = 'none';
    }
  });
  const barcodeOnlyPng = await photoPage.locator('.print-page').first().screenshot();
  await photoPage.close();

  // 用 canvas 在纸的下半部分涂黑，模拟"填了三格"。坐标清单采样的是归一化矩形，
  // 所以只需要保证墨迹落在那几行里，不用精确到格子。
  const canvasPage = await browser.newPage();
  const inkSheet = async (b64, from = 0.78, to = 0.94) =>
    canvasPage.evaluate(
      async ({ data, from, to }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        context.fillStyle = '#000000';
        context.fillRect(
          0,
          Math.floor(image.height * from),
          image.width,
          Math.ceil(image.height * (to - from)),
        );
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { data: b64, from, to },
    );
  // 把"二维码被挡住"那张做成更接近真实手机照的样子：旋转 3° + 左上到右下阴影。
  // 手写解码器在这种图上必挂，ZXing 应该还能解——这条用例防的就是退回脆弱实现。
  const photoLikeBase64 = await canvasPage.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const pad = Math.round(Math.max(image.width, image.height) * 0.04);
    const canvas = document.createElement('canvas');
    canvas.width = image.width + pad * 2;
    canvas.height = image.height + pad * 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e9e7e1';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((3 * Math.PI) / 180);
    context.translate(-image.width / 2, -image.height / 2);
    context.drawImage(image, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const shade = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.28)');
    context.fillStyle = shade;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, barcodeOnlyPng.toString('base64'));

  const inkedBase64 = await inkSheet(sheetPng.toString('base64'));
  const barcodeInkedBase64 = await inkSheet(photoLikeBase64, 0.7, 0.85);
  await canvasPage.close();

  await openGroup(page, '记录');
  await clickItem(page, '扫描回填');
  await page.waitForSelector('text=拍一张纸', { timeout: 8000 });

  /*
   * 先扫"二维码被挡住"的那张：只靠页尾条码进待确认。
   * 条码载荷短（日期 + 纸张 + 模板短码 + 页号），比二维码更耐大图，
   * 是 P2-2.12 的验收标准之一。
   */
  await page.locator('input[aria-label="选择纸的照片"]').setInputFiles({
    name: 'sheet-barcode-only.png',
    mimeType: 'image/png',
    buffer: Buffer.from(barcodeInkedBase64, 'base64'),
  });
  await page.getByRole('button', { name: '重置四角' }).click();
  await page.getByRole('button', { name: '用这四个角矫正' }).click();
  await page.getByRole('heading', { name: '待确认' }).waitFor({ timeout: 20000 });
  check('扫描：二维码被挡住时条码兜底进待确认', true);
  check(
    '扫描：条码解析出的日期与纸面一致',
    (await page.getByText(`日期：${todayKey}`).count()) > 0,
    todayKey,
  );
  check('扫描：待确认页标明身份来自页尾条码', (await page.getByText(/页尾条码/).count()) > 0);
  await page.getByRole('button', { name: '扫下一张' }).click();
  await page.waitForSelector('text=拍一张纸', { timeout: 8000 });

  await page.locator('input[aria-label="选择纸的照片"]').setInputFiles({
    name: 'sheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(inkedBase64, 'base64'),
  });
  await page.waitForTimeout(600);
  check('扫描：自动识别四角定位点', (await page.getByText('已自动识别四角定位点').count()) > 0);

  // 自动找角会把底部那条墨迹带当成背景边界，所以先点「重置四角」用确定性内缩矩形。
  await page.getByRole('button', { name: '重置四角' }).click();
  await page.getByRole('button', { name: '用这四个角矫正' }).click();
  await page.getByRole('heading', { name: '待确认' }).waitFor({ timeout: 20000 });
  check('扫描：解码二维码并进入待确认', true);
  check('扫描：日期来自纸上的二维码', (await page.getByText(/来自纸上的二维码/).count()) > 0);
  check(
    '扫描：识别出的日期与纸面一致',
    (await page.getByText(`日期：${todayKey}`).count()) > 0,
    todayKey,
  );

  // 纸上的作业行内容必须能读回来（label 来自打印时的坐标清单）
  const recognisedTasks = await page.getByText('数学卷子 3.1').count();
  check('扫描：识别出作业行内容', recognisedTasks > 0, `命中 ${recognisedTasks} 条`);
  const recognisedRatings = await page.getByText(/睡眠 5 分/).count();
  check('扫描：识别出三格自评区块', recognisedRatings > 0, `命中 ${recognisedRatings} 条`);

  const applyButton = page.getByRole('button', { name: /应用这 \d+ 项/ });
  const recognised = (await applyButton.count()) > 0;
  check('扫描：按坐标识别出已填的格子', recognised, recognised ? '' : '没有识别到任何格子');
  if (recognised) {
    await applyButton.click();
    await page.waitForSelector('text=/已回填/', { timeout: 10000 });
    check('扫描：回填写入数据层', true);
    // 回填后三格自评应被写上（涂黑了整行，取到的是最右一格 → 5）。
    // liveQuery 是异步的：刚进页面时滑块还是默认值 3，必须等它读到库里那条记录。
    await openGroup(page, '记录');
    await clickItem(page, '三格自评');
    await page.waitForSelector('text=今天的三格', { timeout: 8000 });
    const moodLoaded = await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('input[type="range"]')].some((node) => node.value === '5'),
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false);
    const sliderValues = await page
      .locator('input[type="range"]')
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    check('纸上三格回填到三格自评', moodLoaded, sliderValues.join(','));
  }

  /* --------------------------------------------- 响应式：360px 不出框 */

  /*
   * 每页先在大视口点进去，再缩到 360px 量横向溢出。
   * 反过来做不行：360px 时侧栏是抽屉、导航按钮不可见，根本点不到页面。
   */
  const overflowPages = [];
  const pagesToCheck = [
    { group: '记录', title: '作业清单' },
    { group: '记录', title: '课程表' },
    { group: '记录', title: '扫描回填' },
    { group: '记录', title: '三格自评' },
    { group: '记录', title: '自我周报' },
    { group: '工具', title: '环境清单' },
    { group: '心理支持', title: '自助工具箱' },
    { group: '导出', title: '打印 checklist' },
    { group: '导出', title: '模板与校准页' },
  ];
  for (const entry of pagesToCheck) {
    try {
      await openGroup(page, entry.group);
      await clickItem(page, entry.title);
      await sleep(200);
      await page.setViewportSize({ width: 360, height: 740 });
      await sleep(250);
      const overflow = await page.evaluate(
        () => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      );
      if (overflow > 1) overflowPages.push(`${entry.title}+${overflow}px`);
      await page.setViewportSize({ width: 1100, height: 1400 });
      await sleep(150);
    } catch {
      overflowPages.push(`${entry.title}打不开`);
      await page.setViewportSize({ width: 1100, height: 1400 });
    }
  }
  check('360px 宽下各页无横向溢出', overflowPages.length === 0, overflowPages.join(' / '));

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
  // 现在页面上有多个文件输入（命令面板导入、备份横幅导入、数据页导入），按 aria-label 精确定位
  const fileInput = page.locator('input[aria-label="导入数据文件"]');
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

  /* ---------------------------- 侧栏折叠：持久化 / 快捷键 / 图标全部可达 */

  // 从干净状态开始，免得依赖前面那条折叠检查留下的状态。
  await page.evaluate(() => localStorage.removeItem('gofor.ui.sidebarCollapsed'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=拍照录入', { timeout: 15000 });

  // 用 id 定位侧栏：模板页里有第二个 aside（模板列表），不能靠 first() 碰运气。
  const aside = page.locator('#app-sidebar');
  const asideWidth = async () => Math.round((await aside.boundingBox())?.width ?? 0);
  const expandedWidth = await asideWidth();
  check('桌面默认展开侧栏', expandedWidth > 200, `${expandedWidth}px`);

  await page.locator('button[aria-label="折叠侧栏"]').click();
  await sleep(250);
  check(
    '折叠后的 aria-expanded 为 false',
    (await page.locator('button[aria-label="展开侧栏"]').getAttribute('aria-expanded')) === 'false',
  );
  const collapsedWidth = await asideWidth();
  check('折叠后只剩一列图标（56px）', collapsedWidth === 56, `${collapsedWidth}px`);
  check(
    '折叠状态写入 localStorage',
    (await page.evaluate(() => localStorage.getItem('gofor.ui.sidebarCollapsed'))) === '1',
  );

  // 折叠态逐个图标点过去：每个条目都要点得到，名字来自 aria-label / title。
  // 只取「有 title 的按钮」：折叠态图标 + GoFor 标题按钮。
  // （✕ 关闭按钮在桌面是 display:none 但仍有 aria-label，不能混进来。）
  // 主题切换也带 title，但它不是导航入口：必须排除，否则会被当成"点不到"的图标。
  const iconButtons = page.locator('#app-sidebar button[title]:not([aria-label^="主题："])');
  const iconCount = await iconButtons.count();
  const iconNames = [];
  for (let index = 0; index < iconCount; index++) {
    const name = await iconButtons.nth(index).getAttribute('aria-label');
    if (name !== null) iconNames.push(name);
  }
  const unreachable = [];
  for (const name of iconNames) {
    try {
      await page.locator(`#app-sidebar button[aria-label="${name}"]`).click();
      if (name === 'GoFor') {
        await page.waitForSelector('text=任务提示', { timeout: 5000 });
      } else {
        await page.waitForSelector(`h1:has-text("${name}")`, { timeout: 5000 });
      }
    } catch {
      unreachable.push(name);
    }
  }
  check(
    '折叠态每个图标都能导航',
    iconNames.length > 6 && unreachable.length === 0,
    unreachable.length ? `点不到：${unreachable.join('、')}` : `${iconNames.length} 个入口`,
  );

  // 刷新后保持折叠：首帧就是折叠态，不是展开再跳。
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=拍照录入', { timeout: 15000 });
  const widthAfterReload = await asideWidth();
  check('刷新后仍是折叠态', widthAfterReload === 56, `${widthAfterReload}px`);

  await page.locator('button[aria-label="展开侧栏"]').click();
  await sleep(250);
  check('展开后恢复分组手风琴', (await page.locator('aside button[aria-expanded]').count()) === 6);
  check(
    '展开状态写入 localStorage',
    (await page.evaluate(() => localStorage.getItem('gofor.ui.sidebarCollapsed'))) === '0',
  );

  // 快捷键：Ctrl/Cmd+B 切换，且不能抢命令面板的 Ctrl/Cmd+K。
  await page.keyboard.press('Control+b');
  await sleep(200);
  check('Ctrl+B 折叠侧栏', (await asideWidth()) === 56, `${await asideWidth()}px`);
  await page.keyboard.press('Control+b');
  await sleep(200);
  check('Ctrl+B 展开侧栏', (await asideWidth()) === expandedWidth, `${await asideWidth()}px`);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[placeholder="输入命令…"]', { timeout: 5000 });
  await page.keyboard.press('Escape');
  check('Ctrl+K 仍是命令面板（不冲突）', (await asideWidth()) === expandedWidth);

  /* ---------------------- 窄屏：折叠开关不出现，抽屉保持完整文字版 */

  await page.setViewportSize({ width: 360, height: 740 });
  await sleep(300);
  const narrowToggle = page.locator('button[aria-label="折叠侧栏"], button[aria-label="展开侧栏"]');
  check('窄屏不显示折叠开关', !(await narrowToggle.first().isVisible()));

  const drawerClosed = ((await aside.getAttribute('class')) ?? '')
    .split(' ')
    .includes('-translate-x-full');
  check('窄屏侧栏默认是收起的抽屉', drawerClosed);

  await page.locator('button[aria-label="打开菜单"]').click();
  await sleep(300);
  await openGroup(page, '记录');
  check(
    '窄屏抽屉仍是完整文字版',
    await page.locator('aside button').filter({ hasText: '作业清单' }).isVisible(),
  );
  // 点抽屉右上角的 ✕（全屏遮罩的中心在抽屉底下，点不着，也没必要点它）。
  await page.locator('#app-sidebar button[aria-label="关闭菜单"]').click();
  await sleep(300);
  const drawerReclosed = ((await aside.getAttribute('class')) ?? '')
    .split(' ')
    .includes('-translate-x-full');
  check('窄屏抽屉关闭逻辑不变', drawerReclosed);
  await page.setViewportSize({ width: 1100, height: 1400 });
  await sleep(300);

  /* ---------------------------------------------------- 数据与备份页 */

  /* -------------------------------------------------------------- 主题 */

  // P2-2.16：侧栏底部三态切换（跟随系统/浅色/深色）；深色要能持久化。
  const themeButton = page.getByRole('button', { name: /主题：/ });
  check('侧栏有主题切换', (await themeButton.count()) > 0);

  for (let i = 0; i < 3; i += 1) {
    const current = await page.evaluate(() => document.documentElement.dataset.theme);
    if (current === 'dark') break;
    await themeButton.click();
    await sleep(120);
  }
  check(
    '可切到深色主题',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=拍照录入', { timeout: 15000 });
  check(
    '深色主题刷新后保持',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  );
  // 还原到「跟随系统」（下一次点击循环回 system），避免影响后面的截图/PDF 用例。
  await page.getByRole('button', { name: /主题：/ }).click();
  await sleep(120);

  await openGroup(page, '导出');
  await clickItem(page, '数据与备份');
  await page.waitForSelector('text=数据在哪', { timeout: 8000 });
  check('数据与备份页可打开', true);
  check(
    '数据页有导出与导入按钮',
    (await page.getByRole('button', { name: '导出备份（JSON）' }).count()) > 0 &&
      (await page.getByRole('button', { name: '从备份导入' }).count()) > 0,
  );

  const dataDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份（JSON）' }).click();
  const dataFile = await dataDownload;
  check(
    '数据页可导出备份',
    /^gofor-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dataFile.suggestedFilename()),
    dataFile.suggestedFilename(),
  );

  // 数据页也能直接导入：用刚导出的文件走一遍，验证"丢数据能自己救回来"。
  const dataPath = await dataFile.path();
  const dataText = dataPath ? await readFile(dataPath, 'utf8') : '{}';
  await page
    .locator('input[aria-label="选择备份文件"]')
    .last()
    .setInputFiles({
      name: 'gofor-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dataText),
    });
  await page.waitForSelector('text=/已导入 \\d+ 个任务/', { timeout: 10000 });
  check('数据页可导入备份', true);

  /* ------------------------------------------- 打印：模板 / 预览 / 纸张 */

  await openGroup(page, '导出');
  await clickItem(page, '打印 checklist');
  const templateSelect = page.getByLabel('打印模板');
  check('打印页可切换模板', (await templateSelect.count()) > 0);
  if ((await templateSelect.count()) > 0) {
    const optionCount = await templateSelect.locator('option').count();
    check('模板下拉包含多个预设', optionCount >= 3, `${optionCount} 个`);
    await templateSelect.selectOption('week');
    await page.waitForTimeout(400);
    check('模板切换生效', (await templateSelect.inputValue()) === 'week');

    // 应用内打印预览：模态里同样是真实版式
    await page.getByRole('button', { name: '打印预览' }).click();
    const previewDialog = page.getByRole('dialog');
    await previewDialog.waitFor({ timeout: 8000 });
    check('打印预览可打开', true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 纸张必须真的改变输出：A5 的 PDF 页尺寸应为 419.5×595.3pt
    await page.getByRole('button', { name: 'A5', exact: true }).click();
    await page.waitForTimeout(500);
    const a5Bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const mediaBox = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(a5Bytes.toString('latin1'));
    check(
      '纸张尺寸作用于打印输出（A5）',
      mediaBox !== null &&
        Math.abs(Number(mediaBox[1]) - 419.5) < 2 &&
        Math.abs(Number(mediaBox[2]) - 595.3) < 2,
      mediaBox === null ? 'PDF 里没有 MediaBox' : `${mediaBox[1]}×${mediaBox[2]}pt`,
    );

    // 还原成默认（A4 + 我的一天），后面的 PDF 断言仍按 A4 走
    await templateSelect.selectOption('day');
    await page.getByRole('button', { name: 'A4', exact: true }).click();
    await page.waitForTimeout(400);
  }

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
