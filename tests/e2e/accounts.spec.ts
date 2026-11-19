import { test, expect } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createOnlineApp } from '../../server/app';
import { initializeService } from '../../server/bootstrap';
test('register, review, enter an empty workspace and persist a real resume',async({browser})=>{
  test.setTimeout(60000);
  const root=await mkdtemp(join(tmpdir(),'careerpilot-registration-ui-'));
  await initializeService(join(root,'db.sqlite'));
  const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),staticRoot:resolve('dist')});
  await app.provision('admin','Registration-browser-Password!');await app.listen(0);
  const address=app.server.address();if(!address||typeof address==='string')throw Error('port');
  const origin=`http://127.0.0.1:${address.port}`,studentContext=await browser.newContext(),adminContext=await browser.newContext();
  const student=await studentContext.newPage(),admin=await adminContext.newPage();
  try {
    await student.goto(origin+'/#/login');await student.getByRole('link',{name:'注册账号',exact:true}).click();
    await expect(student.getByRole('heading',{name:'注册账号',exact:true})).toBeVisible();
    await student.getByLabel('账号',{exact:true}).fill('browser.chen');await student.getByLabel('姓名',{exact:true}).fill('陈思远');
    await student.getByLabel('密码',{exact:true}).fill('Registration-browser-Password!');await student.getByLabel('学号',{exact:true}).fill('2027999901');
    await student.getByLabel('专业',{exact:true}).selectOption('major-1');await student.getByLabel('毕业年份',{exact:true}).fill('2027');
    await student.getByRole('button',{name:'提交注册',exact:true}).click();await expect(student.getByRole('heading',{name:'等待账号审核'})).toBeVisible();
    await student.goto(origin+'/#/student');await expect(student.getByRole('heading',{name:'等待账号审核'})).toBeVisible();
    await admin.goto(origin+'/#/login');await admin.getByLabel('账号',{exact:true}).fill('admin');await admin.getByLabel('密码',{exact:true}).fill('Registration-browser-Password!');await admin.getByRole('button',{name:'登录',exact:true}).click();
    const accountRow=admin.locator('.account-list li').filter({hasText:'browser.chen'});
    await expect(accountRow).toContainText('待审核');await expect(accountRow.getByRole('button',{name:'停用',exact:true})).toBeDisabled();
    await admin.getByRole('link',{name:'账号审核',exact:true}).click();
    await admin.getByLabel('账号状态').selectOption('all');
    const card=admin.getByRole('article').filter({hasText:'browser.chen'});
    await expect(card).toContainText('软件工程');await expect(card).toContainText('数字工程学院');
    await card.getByLabel('辅导员').selectOption({label:'林知微'});await card.getByLabel('审核说明').fill('已核对校内学籍信息');await card.getByRole('button',{name:'批准',exact:true}).click();
    await expect(card).toContainText('已通过');
    await student.getByRole('button',{name:'刷新审核状态'}).click();await expect(student.getByRole('button',{name:'进入工作台'})).toBeVisible();await student.getByRole('button',{name:'进入工作台'}).click();
    await student.getByRole('link',{name:'简历工作台',exact:true}).click();await student.getByLabel('联系邮箱',{exact:true}).fill('chen@example.com');await student.getByRole('button',{name:'保存新版本',exact:true}).click();
    await expect(student.getByRole('status')).toContainText('已保存');await student.reload();await expect(student.getByLabel('联系邮箱',{exact:true})).toHaveValue('chen@example.com');
    await student.getByRole('button',{name:'添加教育经历',exact:true}).click();await student.getByLabel('学校',{exact:true}).fill('毕业院校');
    await student.getByLabel('教育学历',{exact:true}).selectOption('bachelor');await student.getByLabel('入学日期',{exact:true}).fill('2023-09-01');
    await student.getByRole('button',{name:'保存新版本',exact:true}).click();await expect(student.getByRole('status')).toContainText('已保存');await student.reload();await expect(student.getByLabel('学校',{exact:true})).toHaveValue('毕业院校');
    await expect(student.locator('body')).not.toContainText('虚构');await expect(student.locator('body')).not.toContainText('演示');
    await student.setViewportSize({width:390,height:844});await expect(student.getByRole('heading',{name:'把经历，写成你的优势。',exact:true})).toBeVisible();
  } finally {await studentContext.close();await adminContext.close();await app.close();await rm(root,{recursive:true,force:true});}
});
test('staff accepts a bound invitation and changes password through the account page',async({browser})=>{
  test.setTimeout(30000);const root=await mkdtemp(join(tmpdir(),'careerpilot-staff-ui-'));await initializeService(join(root,'db.sqlite'));
  const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),staticRoot:resolve('dist')});await app.provision('admin','Registration-browser-Password!');await app.listen(0);
  const address=app.server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${address.port}`;
  const adminContext=await browser.newContext(),staffContext=await browser.newContext(),admin=await adminContext.newPage(),staff=await staffContext.newPage();
  try{
    await admin.goto(origin+'/#/login');await admin.getByLabel('账号',{exact:true}).fill('admin');await admin.getByLabel('密码',{exact:true}).fill('Registration-browser-Password!');await admin.getByRole('button',{name:'登录',exact:true}).click();
    await admin.getByRole('link',{name:'账号审核',exact:true}).click();await admin.getByLabel('邀请账号').fill('teacher.new');await admin.getByRole('button',{name:'生成邀请'}).click();
    const invitation=await admin.getByLabel('邀请链接').inputValue();await staff.goto(invitation);await expect(staff.getByRole('heading',{name:'接受邀请'})).toBeVisible();
    await staff.getByLabel('姓名',{exact:true}).fill('林远川');await staff.getByLabel('密码',{exact:true}).fill('Staff-invited-Password!');await staff.getByRole('button',{name:'提交注册'}).click();
    await expect(staff.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();await staff.getByRole('link',{name:'我的账号',exact:true}).click();
    await expect(staff.getByRole('heading',{name:'我的账号'})).toBeVisible();await staff.getByText('修改密码',{exact:true}).click();await staff.getByLabel('当前密码').fill('Staff-invited-Password!');await staff.getByLabel('新密码').fill('Changed-staff-Password!');await staff.getByRole('button',{name:'更新密码'}).click();
    await expect(staff.getByRole('heading',{name:'登录工作台'})).toBeVisible();await staff.getByLabel('账号',{exact:true}).fill('teacher.new');await staff.getByLabel('密码',{exact:true}).fill('Changed-staff-Password!');await staff.getByRole('button',{name:'登录',exact:true}).click();await expect(staff.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
  }finally{await adminContext.close();await staffContext.close();await app.close();await rm(root,{recursive:true,force:true});}
});
