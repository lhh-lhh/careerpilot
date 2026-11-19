import { expect, test } from '@playwright/test';

test('company profile edits persist without granting certification or permitting identity changes',async({page})=>{
  await page.goto('/#/login');await page.getByRole('radio',{name:'企业',exact:true}).click();await page.getByRole('button',{name:'以企业身份进入'}).click();
  await page.getByRole('button',{name:'维护企业资料',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'企业资料维护',exact:true});
  await expect(dialog.getByLabel('企业全称',{exact:true})).toBeDisabled();
  await dialog.getByLabel('企业介绍',{exact:true}).fill('专注数字产品开发与人才培养，通过规范岗位说明和招聘流程为求职者提供清晰信息。');
  await dialog.getByRole('button',{name:'保存企业资料',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('企业资料已保存');
  await page.reload();await page.getByRole('button',{name:'维护企业资料',exact:true}).click();
  await expect(dialog.getByLabel('企业介绍',{exact:true})).toHaveValue('专注数字产品开发与人才培养，通过规范岗位说明和招聘流程为求职者提供清晰信息。');
  await expect(dialog.getByText('编辑资料不会授予企业准入或工商认证。',{exact:true})).toBeVisible();
});
