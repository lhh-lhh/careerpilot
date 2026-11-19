import { expect,test } from '@playwright/test';
async function enter(page:import('@playwright/test').Page){await page.goto('/#/login');await page.getByRole('button',{name:'以学生身份进入'}).click();}
test('nationwide cities and custom salary filter update the real list, and navigation retains text',async({page})=>{
  await page.setViewportSize({width:1024,height:800});await enter(page);await page.getByRole('link',{name:'岗位匹配',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'简历工作台'}).locator('span')).toBeVisible();
  await expect(page.getByRole('heading',{level:2}).first()).toBeVisible();
  await page.getByLabel('工作城市',{exact:true}).selectOption('city-beijing');await expect(page.getByRole('heading',{name:'暂时没有匹配此筛选的岗位'})).toBeVisible();
  await page.getByLabel('工作城市',{exact:true}).selectOption('');await page.getByLabel('薪资范围',{exact:true}).selectOption('custom');
  await page.getByLabel('最低月薪筛选',{exact:true}).fill('900000');await expect(page.getByRole('heading',{name:'暂时没有匹配此筛选的岗位'})).toBeVisible();
  await page.getByLabel('最高月薪筛选',{exact:true}).fill('100');await expect(page.getByRole('alert')).toContainText('最低薪资不能高于最高薪资');
  await page.getByRole('button',{name:'清空筛选',exact:true}).click();await expect(page.locator('.job-row')).not.toHaveCount(0);
});
test('independent interview templates expose questions without pretending to be live vacancies',async({page})=>{
  await enter(page);await page.getByRole('link',{name:'模拟面试',exact:true}).click();
  const templates=page.getByRole('region',{name:'岗位面试练习模板'});await expect(templates.getByRole('article')).toHaveCount(4);
  await templates.getByText('查看示例问题',{exact:true}).first().click();await expect(templates.getByText('组件状态与接口请求如何组织？',{exact:true})).toBeVisible();
  await expect(templates).toContainText('练习模板，不是可投递岗位');
});
