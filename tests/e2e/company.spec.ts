import { test, expect, type Page } from "@playwright/test";

async function enterCompany(page: Page) {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "企业", exact: true }).click();
  await page.getByRole("button", { name: "以企业身份进入" }).click();
}

test("E04 company manually publishes a job and advances a consented candidate through an agreement", async ({
  page,
}) => {
  await enterCompany(page);
  await expect(
    page.getByRole("heading", { name: "让每一次招聘推进，都有清晰依据。" }),
  ).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "招聘工作台视图" });
  await tabs.getByRole("link", { name: "岗位管理" }).click();
  await page.getByRole("button", { name: "发布新岗位" }).click();
  const dialog = page.getByRole("dialog", { name: "发布新岗位" });
  await dialog
    .getByRole("textbox", { name: "岗位名称" })
    .fill("校园前端开发实习生");
  await dialog.getByLabel("工作城市").selectOption("city-2");
  await dialog.getByLabel("所属行业").selectOption("industry-1");
  await dialog.getByLabel("核心技能").selectOption("skill-2");
  await dialog.getByRole("spinbutton", { name: "最低月薪" }).fill("9000");
  await dialog.getByRole("spinbutton", { name: "最高月薪" }).fill("13000");
  await dialog
    .getByRole("textbox", { name: "岗位职责" })
    .fill("参与校园数字产品前端开发，与产品和设计同学协作完成真实功能交付。");
  await dialog.getByLabel("投递截止时间").fill("2026-12-20T16:00");
  await dialog.getByRole("button", { name: "保存并发布" }).click();
  await expect(page.getByRole("status")).toContainText("岗位已发布");
  await expect(
    page.getByText("校园前端开发实习生", { exact: true }),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "候选人流程" }).click();
  await page.getByRole("button", { name: /申请 057/ }).click();
  await page.getByRole("button", { name: "安排面试" }).click();
  const schedule = page.getByRole("dialog", { name: "安排候选人面试" });
  await schedule.getByLabel("面试时间").fill("2026-12-20T14:00");
  await schedule
    .getByRole("textbox", { name: "面试地点" })
    .fill("教学在线会议室 B");
  await schedule.getByRole("button", { name: "确认安排" }).click();
  await expect(
    page.locator(".candidate-detail").getByText("面试阶段", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "完成面试" }).click();
  const result = page.getByRole("dialog", { name: "记录面试结果" });
  await result.getByLabel("面试结论").selectOption("pass");
  await result
    .getByRole("textbox", { name: "面试反馈" })
    .fill("项目证据清晰，技术基础和协作表达符合岗位要求。");
  await result.getByRole("button", { name: "保存结果" }).click();
  await page.getByRole("button", { name: "发出录用意向" }).click();
  await page.getByRole("button", { name: "创建就业协议" }).click();
  await page.getByRole("button", { name: "企业确认协议" }).click();
  await expect(page.getByText("等待学生确认", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("等待学生确认", { exact: true })).toBeVisible();
});
