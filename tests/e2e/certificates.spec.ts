import {expect,test} from '@playwright/test';
test('certificate upload, explanation, version save and snapshot download are usable',async({page})=>{
 await page.goto('/#/login');await page.getByRole('button',{name:'以学生身份进入'}).click();await page.getByRole('link',{name:'简历工作台',exact:true}).click();
 await page.getByRole('button',{name:'添加证书',exact:true}).click();const row=page.locator('#resume-certificates .entry').last();
 await row.getByLabel('证书名称',{exact:true}).fill('课程实践证书');await row.getByLabel('颁发机构',{exact:true}).fill('测试机构');await row.getByLabel('获得日期',{exact:true}).fill('2026-01-01');await row.getByLabel('证书说明',{exact:true}).fill('仅测试用：记录课程实践成果，不编造本人证书。');
 await row.getByLabel('上传证书文件',{exact:true}).setInputFiles({name:'certificate.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test-certificate')});
 await expect(row.getByRole('button',{name:'下载 certificate.pdf',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'保存新版本',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');await page.reload();
 const saved=page.locator('#resume-certificates .entry').last();await expect(saved.getByLabel('证书说明',{exact:true})).toHaveValue('仅测试用：记录课程实践成果，不编造本人证书。');await expect(saved.getByRole('button',{name:'下载 certificate.pdf',exact:true})).toBeVisible();
});
