import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('review rejection, company edit, admission and counselor handover remain scoped in independent sessions', async ({ browser }) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(),'careerpilot-governance-'));
  const app = await createOnlineApp({ databasePath: join(root,'test.sqlite'), seed: true, staticRoot: resolve('dist') });
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    for (const name of ['admin','company1','counselor1','student010']) await app.provision(name,'Governance-test-Password!');
    await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('no port');
    const base = `http://127.0.0.1:${address.port}`;
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    const [admin,company,counselor,student] = pages as [typeof pages[number],typeof pages[number],typeof pages[number],typeof pages[number]];
    for (const [i,name] of ['admin','company1','counselor1','student010'].entries()) {
      const page = pages[i]!; await page.goto(`${base}/#/login`);
      await page.getByRole('textbox',{name:'账号',exact:true}).fill(name); await page.getByLabel('密码',{exact:true}).fill('Governance-test-Password!');
      await page.getByRole('button',{name:'登录',exact:true}).click(); await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible();
    }
    await company.goto(`${base}/#/company/jobs`);
    await company.getByRole('button',{name:'发布新岗位',exact:true}).click();
    await company.getByLabel('岗位名称',{exact:true}).fill('待审核的校园开发岗位');
    await company.getByLabel('岗位职责',{exact:true}).fill('负责校园应用的界面开发与测试，明确工作职责并提供实习指导。');
    await company.getByRole('button',{name:'保存并提审',exact:true}).click(); await expect(company.getByRole('status')).toContainText('已提交审核');
    await admin.getByRole('link',{name:'准入与岗位审核',exact:true}).click();
    await admin.getByLabel('查找岗位',{exact:true}).fill('待审核的校园开发岗位');
    await expect(admin.getByRole('region',{name:'岗位审核队列'}).getByRole('article')).toHaveCount(1);
    const row = admin.getByRole('article').filter({hasText:'待审核的校园开发岗位'});
    await row.getByRole('button',{name:'退回修改',exact:true}).click();
    await admin.getByRole('dialog').getByLabel('办理原因',{exact:true}).fill('请补充指导安排与具体工作时间。');
    await admin.getByRole('dialog').getByRole('button',{name:'确认办理',exact:true}).click(); await expect(row.getByText('已退回',{exact:true})).toBeVisible();
    const companyRow = company.getByRole('row').filter({hasText:'待审核的校园开发岗位'});
    await expect(companyRow.getByText('已退回',{exact:true})).toBeVisible();
    await companyRow.getByRole('button',{name:'编辑岗位',exact:true}).click();
    await company.getByRole('dialog').getByLabel('岗位职责',{exact:true}).fill('每周三天参与界面开发和测试，导师每周提供一次技术指导与工作反馈。');
    await company.getByRole('dialog').getByRole('button',{name:'保存并提审',exact:true}).click(); await expect(company.getByRole('dialog')).toHaveCount(0);
    await expect(row.getByText('待审核',{exact:true})).toBeVisible();
    await row.getByRole('button',{name:'通过上架',exact:true}).click(); await admin.getByRole('dialog').getByLabel('办理原因',{exact:true}).fill('职责与时间已补充核实，通过上架。');
    await admin.getByRole('dialog').getByRole('button',{name:'确认办理',exact:true}).click(); await expect(row.getByText('已上架',{exact:true})).toBeVisible();
    await row.getByText('办理历史',{exact:true}).click(); await expect(row.getByText('请补充指导安排与具体工作时间。',{exact:true})).toBeVisible();
    await counselor.getByRole('link',{name:'帮扶跟进',exact:true}).click(); await counselor.getByRole('button',{name:'新建帮扶',exact:true}).click();
    await counselor.getByRole('dialog').getByRole('combobox',{name:'学生',exact:true}).selectOption('student-010');
    await counselor.getByRole('dialog').getByLabel('行动计划',{exact:true}).fill('内部沟通核实记录，不应出现在学生端。');
    await counselor.getByRole('dialog').getByLabel('学生可见行动（可选）',{exact:false}).fill('完善项目经历后与辅导员复查。');
    await counselor.getByRole('dialog').getByRole('button',{name:'保存记录',exact:true}).click(); await expect(counselor.getByRole('status')).toContainText('已保存');
    await student.goto(`${base}/#/student`); await expect(student.getByText('完善项目经历后与辅导员复查。',{exact:true})).toBeVisible();
    await expect(student.getByText('内部沟通核实记录，不应出现在学生端。',{exact:true})).toHaveCount(0);
    await admin.getByLabel('查找学生',{exact:true}).fill('DEMO2026010');
    await admin.getByRole('region',{name:'学生辖区交接',exact:true}).getByRole('button',{name:'交接辖区',exact:true}).click();
    await admin.getByRole('dialog').getByRole('combobox',{name:'接收辅导员',exact:true}).selectOption('user-counselor-004');
    await admin.getByRole('dialog').getByLabel('交接原因',{exact:true}).fill('已确认学院分工变更，由新老师接续支持。');
    await admin.getByRole('dialog').getByRole('button',{name:'确认交接',exact:true}).click(); await expect(admin.getByRole('status')).toContainText('交接已保存');
    await expect(counselor.getByRole('article').filter({hasText:'内部沟通核实记录'})).toHaveCount(0);
    await admin.setViewportSize({width:375,height:812});
    expect(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  } finally { for (const context of contexts) await context.close(); await app.close(); await rm(root,{recursive:true,force:true}); }
});
