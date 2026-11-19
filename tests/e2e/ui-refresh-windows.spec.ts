import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createOnlineApp } from '../../server/app';
test.use({ actionTimeout: 10000 });

async function enter(page: Page, role = '学生') {
  await page.goto('/#/login');
  await page.getByRole('radio', { name: role, exact: true }).check();
  await page.getByRole('button', { name: `以${role}身份进入`, exact: true }).click();
}

// Missing family forwarding, clipped controls, or an unreachable close breaks this check.
async function windowFrame(page: Page, title: string, id: string, browser: string) {
  const panel = page.getByRole('dialog', { name: title, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.locator(':scope > header .window-art')).toBeVisible();
  await expect(panel).toHaveAttribute('data-scene', /journey|paper|studio|governance|service/);
  const path = join(tmpdir(), 'careerpilot-ui-final-20261117', browser, 'windows', id);
  await mkdir(path, { recursive: true });
  for (const theme of ['light', 'dark']) for (const width of [1440, 320]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.setViewportSize({ width, height: width === 320 ? 480 : 1000 });
    expect((await panel.locator(':scope > header > h2').boundingBox())!.width, `${id} title must keep readable horizontal space`).toBeGreaterThanOrEqual(80);
    expect(await panel.locator(':scope > header').evaluate(el=>{
      const art=el.querySelector('.window-art')!.getBoundingClientRect();
      return [...el.querySelectorAll('h2,button')].every(n=>{const b=n.getBoundingClientRect();return Math.min(b.right,art.right)<=Math.max(b.left,art.left)+1||Math.min(b.bottom,art.bottom)<=Math.max(b.top,art.top)+1;});
    })).toBe(true);
    await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await panel.locator('.overlay-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(panel.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
    for (const button of await panel.locator(':scope > footer button').all()) {
      await expect(button).toBeInViewport();
      expect(await button.evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), `${id} footer control must not be covered`).toBe(true);
    }
    await page.screenshot({ path: join(path, `${theme}-${width}.png`), animations: 'disabled' });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return panel;
}

test('UI final shared navigation, help, clear, local connection and design windows', async ({ page }, info) => {
  test.setTimeout(90000);
  await enter(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await (await windowFrame(page, '工作空间', 'W01', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '帮助与说明', exact: true }).click();
  const help = await windowFrame(page, '帮助与说明', 'W02-offline', info.project.name);
  await help.getByRole('button', { name: '清除我的本机数据', exact: true }).click();
  const clear = await windowFrame(page, '清除我的本机数据', 'W03', info.project.name);
  await expect(clear.getByRole('button', { name: '确认清除', exact: true })).toBeDisabled();
  await clear.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '本机AI连接', exact: true }).click();
  await (await windowFrame(page, '本机 AI 连接', 'W06-unpaired', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('/#/student/data-check');
  await page.getByRole('button', { name: '清除本人演示数据', exact: true }).click();
  await (await windowFrame(page, '清除本人的演示数据？', 'W33-student', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
  await page.goto('/#/design-system');
  for (const [trigger, title, id] of [['打开抽屉演示', '一束清晰的指引', 'W35-drawer'], ['打开弹窗演示', '决定始终在你手中', 'W35-modal']]) {
    await page.getByRole('button', { name: trigger, exact: true }).click();
    await (await windowFrame(page, title!, id!, info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  }
});

// Valid, two-page, locally generated vector PDF; no external file or document service.
function twoPagePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 32 >>\nstream\n0 0 1 rg 20 20 260 360 re f\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 6 0 R >>',
    '<< /Length 32 >>\nstream\n0 1 0 rg 20 20 260 360 re f\nendstream'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('UI final valid multipage PDF preserves page switching and original download at 320px', async ({ page }, info) => {
  await enter(page); await page.goto('/#/student/resume');
  await page.getByRole('button', { name: '添加证书', exact: true }).click();
  const row = page.locator('#resume-certificates .entry').last();
  await row.getByLabel('证书名称', { exact: true }).fill('双页隔离验收材料');
  await row.getByLabel('上传证书文件', { exact: true }).setInputFiles({ name: 'two-page.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
  await row.getByRole('button', { name: '预览 two-page.pdf', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '证书文件预览', exact: true });
  await expect(panel.getByRole('region', { name: 'PDF文件预览' })).toHaveAttribute('aria-busy', 'false');
  await expect(panel.getByRole('img', { name: 'PDF第1页', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(panel.getByRole('img', { name: 'PDF第2页', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await windowFrame(page, '证书文件预览', 'W10-valid-pdf-W36', info.project.name);
  await page.setViewportSize({ width: 320, height: 480 });
  const nav = panel.getByRole('navigation', { name: 'PDF翻页', exact: true });
  for (const button of await nav.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await panel.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(panel.getByRole('img', { name: 'PDF第1页', exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: '下载原文件', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('two-page.pdf');
});

test('UI final student history, match, consent, withdrawal and early-end windows', async ({ page }, info) => {
  test.setTimeout(90000);
  await enter(page);
  await page.goto('/#/student/resume');
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('林知夏');
  await page.getByRole('button', { name: '版本对比', exact: true }).click();
  await (await windowFrame(page, '简历版本对比', 'W11', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('/#/student/jobs');
  await page.getByRole('button', { name: '查看匹配依据', exact: true }).first().click();
  await (await windowFrame(page, '每一分，都有依据', 'W12', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '投递岗位', exact: true }).first().click();
  const apply = await windowFrame(page, '确认投递当前简历', 'W13', info.project.name);
  await expect(apply.getByRole('button', { name: '确认投递', exact: true })).toBeDisabled();
  await apply.getByRole('checkbox', { name: '同意向该企业提供当前简历快照' }).check();
  await apply.getByRole('button', { name: '确认投递', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('投递成功');
  await page.goto('/#/student/applications');
  // Original selection falls back to the first repository row; equal fixed-clock
  // timestamps do not guarantee that this is the newly applied (withdrawable) row.
  await page.getByRole('region', { name: '我的投递列表', exact: true }).getByRole('button', { name: /^已投递 / }).first().click();
  await page.getByRole('button', { name: '撤回投递', exact: true }).click();
  await (await windowFrame(page, '确认撤回本次投递', 'W14', info.project.name)).getByRole('button', { name: '暂不撤回', exact: true }).click();
  await page.goto('/#/student/mock');
  await page.getByRole('button', { name: '开始新练习', exact: true }).click();
  await page.getByRole('button', { name: '提前结束', exact: true }).click();
  await (await windowFrame(page, '提前结束本次练习', 'W16', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
});

test('UI final enterprise profile, new and edit job, schedule, result, cancel and rejection windows', async ({ page }, info) => {
  test.setTimeout(120000);
  await enter(page, '企业');
  await page.getByRole('button', { name: '维护企业资料', exact: true }).click();
  await (await windowFrame(page, '企业资料维护', 'W17', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  await page.goto('/#/company/jobs');
  await page.getByRole('button', { name: '发布新岗位', exact: true }).click();
  await (await windowFrame(page, '发布新岗位', 'W18-new', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: '关闭', exact: true }) }).first();
  await row.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '编辑岗位', exact: true }).first().click();
  await (await windowFrame(page, '编辑岗位', 'W18-edit', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
  await page.goto('/#/company/candidates');
  await page.getByRole('button', { name: /申请 057/ }).click();
  await page.getByRole('button', { name: '安排面试', exact: true }).click();
  const schedule = await windowFrame(page, '安排候选人面试', 'W19-schedule', info.project.name);
  await schedule.getByLabel('面试时间').fill('2026-12-20T14:00');
  await schedule.getByLabel('面试地点', { exact: true }).fill('隔离验收会议室');
  await schedule.getByRole('button', { name: '确认安排', exact: true }).click();
  await expect(schedule).toBeHidden();
  for (const [trigger, title, id] of [['调整面试', '调整候选人面试', 'W19-reschedule'], ['取消邀约', '取消本次面试', 'W20'], ['完成面试', '记录面试结果', 'W21'], ['结束候选流程', '结束候选流程', 'W22']]) {
    await page.getByRole('button', { name: trigger, exact: true }).click();
    await (await windowFrame(page, title!, id!, info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  }
});

test('UI final counselor revocation and all dashboard assistance branches', async ({ page }, info) => {
  test.setTimeout(90000);
  await enter(page, '辅导员');
  await page.getByRole('button', { name: '查看 林知夏 的就业材料', exact: true }).click();
  await page.getByRole('button', { name: '撤销审批', exact: true }).click();
  const revoke = await windowFrame(page, '撤销本次审批', 'W25-revoke', info.project.name);
  await expect(revoke.getByRole('button', { name: '确认撤销', exact: true })).toBeDisabled();
  await revoke.getByLabel('撤销原因', { exact: true }).fill('隔离验收需核实材料原始依据。');
  await revoke.getByRole('button', { name: '确认撤销', exact: true }).click();
  await page.goto('/#/counselor/dashboard');
  await page.getByRole('button', { name: '记录 林知夏 的帮扶行动', exact: true }).click();
  const create = await windowFrame(page, '记录帮扶行动', 'W26-create', info.project.name);
  await create.getByLabel('帮扶记录', { exact: true }).fill('隔离验收：核实材料并制定复查计划。');
  await create.getByRole('button', { name: '保存帮扶', exact: true }).click();
  const item = page.locator('.risk-item').filter({ hasText: '林知夏' });
  await item.getByRole('button', { name: '记录复查', exact: true }).click();
  const review = await windowFrame(page, '记录帮扶复查', 'W26-review', info.project.name);
  await review.getByLabel('复查记录', { exact: true }).fill('隔离验收：复查材料已经完成核实。');
  await review.getByRole('button', { name: '保存帮扶', exact: true }).click();
  await item.getByRole('button', { name: '确认关闭', exact: true }).click();
  const close = await windowFrame(page, '关闭帮扶记录', 'W26-close', info.project.name);
  await expect(close.getByRole('button', { name: '确认关闭', exact: true })).toBeDisabled();
  await close.getByRole('button', { name: '取消', exact: true }).click();
});

test('UI final all support record branches and administrator reset confirmations', async ({ page }, info) => {
  test.setTimeout(90000);
  await enter(page, '辅导员');
  await page.goto('/#/counselor/support');
  await page.getByRole('button', { name: '新建帮扶', exact: true }).click();
  let panel = await windowFrame(page, '新建帮扶', 'W27-create', info.project.name);
  await panel.getByRole('combobox', { name: '学生', exact: true }).selectOption('student-010');
  await panel.getByLabel('行动计划', { exact: true }).fill('全站窗口验收专项跟进计划。');
  await panel.getByRole('button', { name: '保存记录', exact: true }).click();
  const record = page.getByRole('article').filter({ hasText: '全站窗口验收专项跟进计划。' });
  await record.getByRole('button', { name: '记录复查', exact: true }).click();
  panel = await windowFrame(page, '记录复查', 'W27-review', info.project.name);
  await panel.getByLabel('复查记录', { exact: true }).fill('已完成隔离验收复查，准备核实结案。');
  await panel.getByRole('button', { name: '保存记录', exact: true }).click();
  await record.getByRole('button', { name: '结案', exact: true }).click();
  panel = await windowFrame(page, '确认结案', 'W27-close', info.project.name);
  await panel.getByLabel('已核实并确认结案', { exact: true }).check();
  await panel.getByRole('button', { name: '保存记录', exact: true }).click();
  await record.getByRole('button', { name: '重开', exact: true }).click();
  await (await windowFrame(page, '重开帮扶', 'W27-reopen', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '退出演示', exact: true }).click();
  await enter(page, '管理员');
  await page.getByRole('button', { name: '复位演示环境', exact: true }).click();
  panel = await windowFrame(page, '复位整个演示环境', 'W32', info.project.name);
  await expect(panel.getByRole('button', { name: '确认复位', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await page.goto('/#/admin/data-check');
  await page.getByRole('button', { name: '复位完整虚构种子', exact: true }).click();
  await (await windowFrame(page, '复位整个演示环境？', 'W33-admin', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
});

test('UI final online interview responses, offer issue, accept, refuse, withdraw and historical paper', async ({ browser }, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-offers-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    for (const login of ['student040', 'company1']) await app.provision(login, 'UI-window-isolated-only!');
    const studentActor = { userId: 'user-student-040', role: 'student' as const }, companyActor = { userId: 'user-company-001', role: 'company' as const };
    const clock = { now: () => new Date().toISOString() };
    await app.repository.execute({ type: 'APPLY', entityId: 'ui-window-offer', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { jobId: 'job-001', resumeConsent: true } }, studentActor, clock);
    await app.repository.execute({ type: 'APPLICATION_ACTION', entityId: 'ui-window-offer', expectedRevision: 1, commandId: crypto.randomUUID(), payload: { action: 'SCHEDULE_INTERVIEW', scheduledAt: '2026-12-20T10:00:00Z', location: '隔离会议室' } }, companyActor, clock);
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`;
    const student = await contexts[0]!.newPage(), company = await contexts[1]!.newPage();
    for (const [page, login] of [[student, 'student040'], [company, 'company1']] as const) {
      await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill(login); await page.getByLabel('密码', { exact: true }).fill('UI-window-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
      await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
    }
    await student.goto(origin + '/#/student/applications?application=ui-window-offer');
    for (const title of ['确认参加', '申请改期', '拒绝邀约']) {
      await student.getByRole('button', { name: title, exact: true }).click();
      const panel = await windowFrame(student, title, 'W15-' + title, info.project.name);
      await expect(panel.getByRole('button', { name: '提交响应', exact: true }))[title === '确认参加' ? 'toBeEnabled' : 'toBeDisabled']();
      await panel.getByRole('button', { name: '暂不提交', exact: true }).click();
    }
    await app.repository.execute({ type: 'APPLICATION_ACTION', entityId: 'ui-window-offer', expectedRevision: 2, commandId: crypto.randomUUID(), payload: { action: 'COMPLETE_INTERVIEW', result: 'pass', feedback: '隔离验收能力核验通过。' } }, companyActor, clock);
    await company.goto(origin + '/#/company/candidates?application=ui-window-offer');
    await company.reload();
    const issue = async (location: string, id: string) => {
      await company.getByRole('button', { name: '发出录用意向', exact: true }).click();
      const panel = await windowFrame(company, '签发录用意向文书', id, info.project.name);
      await panel.getByLabel('工作地点', { exact: true }).fill(location);
      await panel.getByLabel('薪酬说明', { exact: true }).fill('隔离验收薪酬说明，具体条款以双方合同为准。');
      await panel.getByLabel('预计到岗日期', { exact: true }).fill('2027-07-01');
      await panel.getByLabel('响应截止时间', { exact: true }).fill('2026-12-25T18:00');
      await panel.getByRole('button', { name: '签发文书', exact: true }).click();
      await expect(panel).toBeHidden(); await student.reload();
      await expect(student.getByRole('region', { name: '当前录用意向文书' })).toContainText(location);
    };
    await issue('上海隔离验收地点', 'W23');
    for (const title of ['接受录用意向', '拒绝录用意向']) {
      await student.getByRole('button', { name: title, exact: true }).click();
      await (await windowFrame(student, title, 'W15-' + title, info.project.name)).getByRole('button', { name: '暂不提交', exact: true }).click();
    }
    await company.getByRole('button', { name: '撤销录用意向', exact: true }).click();
    const withdrawal = await windowFrame(company, '撤销录用意向', 'W24', info.project.name);
    await expect(withdrawal.getByRole('button', { name: '确认撤销', exact: true })).toBeDisabled();
    await withdrawal.getByLabel('撤销原因', { exact: true }).fill('隔离验收更正地点后重新签发。');
    await withdrawal.getByRole('button', { name: '确认撤销', exact: true }).click();
    await issue('杭州隔离验收地点', 'W23-reissue');
    await student.getByText('历史意向文书（1）', { exact: true }).click();
    const paper = student.getByRole('region', { name: '当前录用意向文书' });
    expect(await paper.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    const path = join(tmpdir(), 'careerpilot-ui-final-20261117', info.project.name, 'windows', 'W37'); await mkdir(path, { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      await student.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await student.setViewportSize({ width, height: 1000 });
      expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await student.screenshot({ path: join(path, `${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  } finally { for (const context of contexts) await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final online governance all review branches, handover, account, messages, image and service windows', async ({ browser }, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-governance-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const context = await browser.newContext();
  try {
    await app.provision('admin', 'UI-window-isolated-only!'); await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, page = await context.newPage();
    await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('UI-window-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.locator('button:not(:disabled)').filter({ hasText: /^停用$/ }).first().click();
    await (await windowFrame(page, '确认停用账号', 'W31', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
    for (const [trigger, title, id] of [['消息', '消息中心', 'W04'], ['工作区形象设置', '工作区形象设置', 'W05'], ['帮助与说明', '帮助与说明', 'W02-online']]) {
      await page.getByRole('button', { name: trigger, exact: true }).click();
      await (await windowFrame(page, title!, id!, info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
    }
    await page.goto(origin + '/#/admin/admission');
    await page.getByRole('button', { name: '下架岗位', exact: true }).first().click();
    await (await windowFrame(page, '下架岗位', 'W29-takedown', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
    const companyActor = { userId: 'user-company-001', role: 'company' as const }, clock = { now: () => new Date().toISOString() };
    const saved = await app.repository.execute({ type: 'SAVE_JOB', entityId: 'ui-final-review-job', expectedRevision: 0, commandId: crypto.randomUUID(), payload: { title: '全站窗口审核测试岗位', categoryId: 'jobCategory-digital', industryId: 'industry-1', cityId: 'city-1', salaryRange: { min: 8000, max: 12000 }, requiredSkills: [{ skillId: 'skill-1', weight: 1 }], preferredMajorIds: [], minDegree: 'bachelor', minExperienceMonths: 0, jdText: '隔离验收岗位职责，提供界面测试和技术指导。', deadline: '2026-12-20T10:00:00Z' } }, companyActor, clock);
    await app.repository.execute({ type: 'JOB_ACTION', entityId: 'ui-final-review-job', expectedRevision: (saved as { revision: number }).revision, commandId: crypto.randomUUID(), payload: { action: 'PUBLISH' } }, companyActor, clock);
    await page.reload(); await page.getByLabel('查找岗位', { exact: true }).fill('全站窗口审核测试岗位');
    for (const [title, id] of [['通过上架', 'W29-approve'], ['退回修改', 'W29-reject']]) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await (await windowFrame(page, title!, id!, info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
    }
    const company = page.getByRole('region', { name: '企业准入', exact: true }).getByRole('listitem').first();
    await company.getByRole('button', { name: '暂停准入', exact: true }).click();
    let panel = await windowFrame(page, '暂停企业准入', 'W28-pause', info.project.name);
    await panel.getByLabel('办理原因', { exact: true }).fill('隔离验收暂停准入流程。'); await panel.getByRole('button', { name: '确认办理', exact: true }).click();
    await company.getByRole('button', { name: '核准准入', exact: true }).click();
    panel = await windowFrame(page, '核准企业准入', 'W28-admit', info.project.name);
    await panel.getByLabel('办理原因', { exact: true }).fill('隔离验收恢复准入流程。'); await panel.getByRole('button', { name: '确认办理', exact: true }).click();
    await page.getByRole('button', { name: '交接辖区', exact: true }).first().click();
    await (await windowFrame(page, '学生辖区交接', 'W30', info.project.name)).getByRole('button', { name: '取消', exact: true }).click();
    await page.goto(origin + '/#/admin/service');
    await page.getByLabel('问题说明', { exact: true }).fill('隔离验收用于服务窗口与长正文展示的测试工单。');
    await page.getByRole('button', { name: '提交工单', exact: true }).click();
    await page.getByRole('button', { name: '查看工单', exact: true }).first().click();
    await (await windowFrame(page, '工单详情', 'W34-admin-open', info.project.name)).getByRole('button', { name: '关闭', exact: true }).click();
  } finally { await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI final certificate image, invalid PDF and counselor rejection windows', async ({ page }, info) => {
  test.setTimeout(60000);
  await enter(page); await page.goto('/#/student/resume');
  await page.getByRole('button', { name: '添加证书', exact: true }).click();
  const row = page.locator('#resume-certificates .entry').last();
  await row.getByLabel('证书名称', { exact: true }).fill('全站证书窗口验收');
  for (const file of [{ name: 'ui-image.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=', 'base64') }, { name: 'ui-invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-isolated-invalid') }]) {
    await row.getByLabel('上传证书文件', { exact: true }).setInputFiles(file);
    await row.getByRole('button', { name: '预览 ' + file.name, exact: true }).click();
    const panel = await windowFrame(page, '证书文件预览', file.name.endsWith('.pdf') ? 'W10-pdf-error' : 'W10-image', info.project.name);
    if (file.name.endsWith('.pdf')) await expect(panel.getByRole('alert')).toContainText('请下载原文件查看');
    await panel.getByRole('button', { name: '关闭', exact: true }).click();
  }
  await page.getByRole('button', { name: '退出演示', exact: true }).click(); await enter(page, '辅导员');
  await page.getByRole('button', { name: '查看 林知夏 的就业材料', exact: true }).click();
  await page.getByRole('button', { name: '撤销审批', exact: true }).click();
  let panel = page.getByRole('dialog'); await panel.getByLabel('撤销原因', { exact: true }).fill('隔离验收核实材料办理流程。'); await panel.getByRole('button', { name: '确认撤销', exact: true }).click();
  await page.getByRole('button', { name: '退出演示', exact: true }).click(); await enter(page);
  await page.goto('/#/student/destination'); await page.getByLabel('毕业去向类型').selectOption('furtherStudy'); await page.getByLabel('升学单位', { exact: true }).fill('隔离验收学院'); await page.getByLabel('证明材料').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('isolated proof') }); await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByRole('status')).toContainText('草稿已保存'); await page.getByRole('button', { name: '提交辅导员审核', exact: true }).click(); await expect(page.getByRole('status')).toContainText('已提交审核');
  await page.getByRole('button', { name: '退出演示', exact: true }).click(); await enter(page, '辅导员');
  await page.getByRole('button', { name: '查看 林知夏 的就业材料', exact: true }).click(); await page.getByRole('button', { name: '驳回并说明', exact: true }).click();
  panel = await windowFrame(page, '驳回本次材料', 'W25-reject', info.project.name);
  await expect(panel.getByRole('button', { name: '确认驳回', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '取消', exact: true }).click();
});

test('UI final paired, tested, enabled and failed connection states remain explicit without real provider calls', async ({ page }, info) => {
  test.setTimeout(60000);
  const calls: string[] = []; let fail = false;
  await page.route('http://127.0.0.1:8787/**', async route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    if (fail && path === '/api/pair') { await route.fulfill({ status: 400, json: { error: { code: 'PAIRING_FAILED' } } }); return; }
    const body = path === '/api/pair' ? { token: 'ui-synthetic-memory-token', expiresAt: '2099-01-01T00:00:00Z', gatewayInstanceId: 'ui-test' }
      : path === '/api/ai/providers' ? { providerId: 'deepseek', model: 'deepseek-flash', configured: true, liveEnabled: true, gatewayInstanceId: 'ui-test' }
        : { status: 'passed', providerId: 'deepseek', model: 'deepseek-flash', latencyMs: 5, usage: null };
    await route.fulfill({ status: path === '/api/unpair' ? 204 : 200, contentType: 'application/json', body: path === '/api/unpair' ? undefined : JSON.stringify(body) });
  });
  await enter(page); await page.getByRole('button', { name: '本机AI连接', exact: true }).click();
  let panel = page.getByRole('dialog', { name: '本机 AI 连接', exact: true });
  await panel.getByLabel('一次性配对码').fill('12345678'); await panel.getByRole('button', { name: '配对本机网关', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已配对');
  await windowFrame(page, '本机 AI 连接', 'W06-paired', info.project.name);
  await expect(panel.getByRole('button', { name: '执行付费连接测试', exact: true })).toBeDisabled();
  await panel.getByRole('checkbox', { name: /可能产生费用/ }).check(); await panel.getByRole('button', { name: '执行付费连接测试', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('测试通过');
  await windowFrame(page, '本机 AI 连接', 'W06-tested', info.project.name);
  await panel.getByRole('button', { name: '启用本次 LIVE', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('LIVE 已启用');
  await windowFrame(page, '本机 AI 连接', 'W06-enabled', info.project.name);
  expect(calls).toEqual(['/api/pair', '/api/ai/providers', '/api/ai/test']);
  await panel.getByRole('button', { name: '停用 LIVE 并解除配对', exact: true }).click();
  fail = true; await panel.getByLabel('一次性配对码').fill('87654321'); await panel.getByRole('button', { name: '配对本机网关', exact: true }).click();
  panel = await windowFrame(page, '本机 AI 连接', 'W06-error', info.project.name);
  await expect(panel.getByRole('alert')).toContainText('配对失败');
  await page.reload();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('ui-synthetic-memory-token');
});

test('UI final service replied, closed and reopened histories and media preview, save, error and reset states', async ({ browser }, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'cp-ui-final-service-'));
  const app = await createOnlineApp({ databasePath: join(root, 'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    for (const login of ['student001', 'admin']) await app.provision(login, 'UI-window-isolated-only!');
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('port');
    const origin = `http://127.0.0.1:${address.port}`, student = await contexts[0]!.newPage(), admin = await contexts[1]!.newPage();
    for (const [page, login] of [[student, 'student001'], [admin, 'admin']] as const) {
      await page.goto(origin + '/#/login'); await page.getByLabel('账号', { exact: true }).fill(login); await page.getByLabel('密码', { exact: true }).fill('UI-window-isolated-only!'); await page.getByRole('button', { name: '登录', exact: true }).click();
      await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
    }
    await student.getByRole('button', { name: '工作区形象设置', exact: true }).click();
    let panel = student.getByRole('dialog', { name: '工作区形象设置', exact: true });
    await panel.getByLabel('选择图片').setInputFiles({ name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic') });
    await expect(panel.getByRole('status')).toContainText('请选择不超过');
    await windowFrame(student, '工作区形象设置', 'W05-invalid', info.project.name);
    await panel.getByLabel('选择图片').setInputFiles(resolve('public/media/campus.jpg'));
    await expect(panel.getByRole('img', { name: '工作区形象预览' })).toBeVisible();
    await windowFrame(student, '工作区形象设置', 'W05-preview', info.project.name);
    await panel.getByRole('button', { name: '保存图片', exact: true }).click(); await expect(panel.getByRole('status')).toContainText('图片已保存');
    await windowFrame(student, '工作区形象设置', 'W05-saved', info.project.name);
    await panel.getByRole('button', { name: '恢复默认', exact: true }).click(); await expect(panel.getByRole('status')).toContainText('已恢复默认');
    await panel.getByRole('button', { name: '关闭', exact: true }).click();
    await student.goto(origin + '/#/student/service'); await student.getByLabel('问题说明', { exact: true }).fill('全站验收核对投递记录与材料的服务入口。'); await student.getByRole('button', { name: '提交工单', exact: true }).click();
    await expect(student.getByRole('status')).toContainText('工单已提交');
    await admin.goto(origin + '/#/admin/service'); await admin.getByRole('button', { name: '查看工单', exact: true }).click();
    panel = await windowFrame(admin, '工单详情', 'W34-admin-open-other', info.project.name);
    await panel.getByLabel('办理说明', { exact: true }).fill('请核对业务时间线及材料来源，如有问题可重开。'); await panel.getByRole('button', { name: '答复工单', exact: true }).click();
    await student.reload();
    await student.getByRole('button', { name: '消息', exact: true }).click();
    const messages = await windowFrame(student, '消息中心', 'W04-unread', info.project.name);
    const unread = messages.getByRole('button', { name: '标为已读', exact: true });
    expect(await unread.count()).toBeGreaterThan(0);
    for (let remaining = await unread.count(); remaining > 0; remaining--) {
      await unread.first().click();
      await expect(unread).toHaveCount(remaining - 1);
    }
    await expect(messages.getByText('已读', { exact: true }).first()).toBeVisible();
    await windowFrame(student, '消息中心', 'W04-read', info.project.name);
    await messages.getByRole('button', { name: '关闭', exact: true }).click();
    await admin.getByRole('button', { name: '查看工单', exact: true }).click(); panel = await windowFrame(admin, '工单详情', 'W34-replied', info.project.name);
    await panel.getByLabel('办理说明', { exact: true }).fill('已完成本次隔离验收服务指引。'); await panel.getByRole('button', { name: '结案', exact: true }).click();
    await student.reload(); await student.getByRole('button', { name: '查看工单', exact: true }).click(); panel = await windowFrame(student, '工单详情', 'W34-closed', info.project.name);
    await expect(panel).toContainText('已结案'); await panel.getByLabel('办理说明', { exact: true }).fill('仍需核对历史投递记录的入口。'); await panel.getByRole('button', { name: '重开工单', exact: true }).click();
    await student.getByRole('button', { name: '查看工单', exact: true }).click(); panel = await windowFrame(student, '工单详情', 'W34-reopened', info.project.name);
    await expect(panel).toContainText('本人重开');
  } finally { for (const context of contexts) await context.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});
