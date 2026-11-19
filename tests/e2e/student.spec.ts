import { test, expect, type Page } from "@playwright/test";
async function enter(page: Page, route: string) {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto(`/#/student/${route}`);
}
test("E01 resume edit and version comparison survive refresh while offline AI stays unavailable", async ({
  page,
}) => {
  await enter(page, "resume");
  await expect(
    page.getByRole("heading", { name: "把经历，写成你的优势。" }),
  ).toBeVisible();
  const description = page.getByRole("textbox", {
    name: "项目描述 1",
    exact: true,
  });
  await description.fill(
    "在课程项目期间，负责前端页面设计与开发，实现信息筛选，完成4个核心页面的交付。",
  );
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(description).toHaveValue(
    "在课程项目期间，负责前端页面设计与开发，实现信息筛选，完成4个核心页面的交付。",
  );
  await page.getByRole("button", { name: "生成表达建议", exact: true }).click();
  await expect(page.getByRole("heading", { name: "改写对照" })).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.getByRole('button',{name:'采纳建议',exact:true})).toHaveCount(0);
  await page.getByRole("button", { name: "版本对比", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "简历版本对比" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("初始版本");
});
test("ALG06 an unavailable generation never exposes an acceptable stale suggestion", async ({
  page,
}) => {
  await enter(page, "resume");
  await page.getByRole("button", { name: "生成表达建议", exact: true }).click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await page
    .getByRole("textbox", { name: "项目描述 1", exact: true })
    .fill("我正在重新核对项目原始经历，不采纳旧建议。");
  await expect(page.getByRole('button',{name:'采纳建议',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('项目描述 1',{exact:true})).toHaveValue('我正在重新核对项目原始经历，不采纳旧建议。');
});
test("E02 job filter, explain six contributions, what-if never writes, consented application reaches timeline", async ({
  page,
}) => {
  await enter(page, "jobs");
  await expect(
    page.getByRole("heading", { name: "找到适合你的下一站。",exact:true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "搜索岗位或企业", exact: true })
    .fill("前端");
  await page
    .getByRole("button", { name: "查看匹配依据", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "每一分，都有依据" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("六维贡献");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("button", { name: "投递岗位", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "确认投递", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "同意向该企业提供当前简历快照" })
    .check();
  await page.getByRole("button", { name: "确认投递", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("投递成功");
  await page.goto("/#/student/applications");
  await expect(
    page.getByRole("heading", { name: "每一步进展，都有迹可循。" }),
  ).toBeVisible();
  await expect(page.getByText("已投递", { exact: true }).first()).toBeVisible();
});
test("E03 mock interview three questions, refresh continuation and evidence report", async ({
  page,
}) => {
  await enter(page, "mock");
  await page.getByRole("button", { name: "开始新练习", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "我的回答", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("textbox", { name: "我的回答", exact: true })
      .fill(
        "在校园项目期间，目标是完成前端页面。我负责使用Vue开发，首先梳理需求，然后实现筛选和状态管理，最终交付4个页面，完成了任务并减少重复操作。",
      );
    await page.getByRole("button", { name: "提交回答", exact: true }).click();
    if (i === 0) {
      await expect(
        page.getByText("第 2 / 3 题", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText("第 2 / 3 题", { exact: true }),
      ).toBeVisible();
    }
  }
  await expect(
    page.getByRole("heading", { name: "每一次表达，都能更进一步。" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "逐题证据" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打印报告", exact: true }),
  ).toBeVisible();
});
