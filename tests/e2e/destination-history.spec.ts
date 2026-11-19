import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';

test('destination rejection, supplemental submission and approval keep both roles history after reload', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(),'careerpilot-destination-history-'));
  const app = await createOnlineApp({ databasePath: join(root,'db.sqlite'), seed: true, staticRoot: resolve('dist') });
  const studentContext = await browser.newContext(), counselorContext = await browser.newContext();
  try {
    for (const name of ['student040','counselor4']) await app.provision(name, 'History-ui-test-password!');
    await app.listen(0); const a = app.server.address(); if (!a || typeof a === 'string') throw Error('no port');
    const base = `http://127.0.0.1:${a.port}`;
    const student = await studentContext.newPage(), counselor = await counselorContext.newPage();
    for (const [page,login] of [[student,'student040'],[counselor,'counselor4']] as const) {
      await page.goto(`${base}/#/login`); await page.getByRole('textbox',{name:'账号',exact:true}).fill(login); await page.getByLabel('密码',{exact:true}).fill('History-ui-test-password!');
      await page.getByRole('button',{name:'登录',exact:true}).click(); await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible();
    }
    await student.getByRole('link',{name:'协议与去向',exact:true}).click();
    await student.getByLabel('毕业去向类型').selectOption('furtherStudy'); await student.getByRole('textbox',{name:'升学单位',exact:true}).fill('示例大学待补充院系');
    await student.getByLabel('证明材料').setInputFiles({name:'proof.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-isolated-history-proof')});
    await student.getByRole('button',{name:'保存草稿',exact:true}).click(); await expect(student.getByRole('status')).toContainText('草稿已保存');
    await student.getByRole('button',{name:'提交辅导员审核',exact:true}).click(); await expect(student.getByRole('status')).toContainText('已提交审核');
    // Use the actual identity emitted by the fixture rather than a roster-position assumption.
    const snapshot = await app.repository.readScopedSnapshot({userId:'user-student-040',role:'student'});
    await counselor.getByRole('button',{name:`查看 ${snapshot.resumes[0]!.sections.basic.name} 的就业材料`,exact:true}).click();
    await counselor.getByRole('button',{name:'驳回并说明',exact:true}).click();
    await counselor.getByRole('dialog').getByLabel('驳回原因',{exact:true}).fill('请补充具体录取院系名称，原附件无需重复提交。');
    await counselor.getByRole('dialog').getByRole('button',{name:'确认驳回',exact:true}).click();
    await expect(student.getByText('请补充具体录取院系名称，原附件无需重复提交。',{exact:true}).first()).toBeVisible();
    await student.getByRole('textbox',{name:'升学单位',exact:true}).fill('示例大学计算机学院');
    await student.getByRole('button',{name:'保存草稿',exact:true}).click(); await expect(student.getByRole('status')).toContainText('草稿已保存');
    await student.getByRole('button',{name:'提交辅导员审核',exact:true}).click(); await expect(student.getByRole('status')).toContainText('已提交审核');
    await expect(counselor.getByRole('button',{name:'通过审核',exact:true})).toBeVisible();
    await counselor.getByRole('button',{name:'通过审核',exact:true}).click(); await expect(counselor.getByRole('status')).toContainText('审核已通过');
    await student.reload(); await student.getByText('历次办理记录',{exact:true}).click();
    const history = student.getByRole('list',{name:'历次去向办理',exact:true});
    await expect(history.getByText('请补充具体录取院系名称，原附件无需重复提交。',{exact:true})).toBeVisible();
    await expect(history.getByText('提交审核',{exact:true})).toHaveCount(2); await expect(history.getByText('审核通过',{exact:true})).toBeVisible();
    await counselor.reload(); await counselor.getByRole('button',{name:`查看 ${snapshot.resumes[0]!.sections.basic.name} 的就业材料`,exact:true}).click();
    await counselor.getByText('历次办理记录',{exact:true}).click(); await expect(counselor.getByRole('list',{name:'历次去向办理'}).getByText('退回补充',{exact:true})).toBeVisible();
  } finally { await studentContext.close(); await counselorContext.close(); await app.close(); await rm(root,{recursive:true,force:true}); }
});
