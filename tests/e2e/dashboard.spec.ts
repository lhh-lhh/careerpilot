import { test, expect, type Page } from "@playwright/test";

async function enterCounselor(page: Page) {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "辅导员", exact: true }).click();
  await page.getByRole("button", { name: "以辅导员身份进入" }).click();
}

test("E06 counselor dashboard recomputes scoped metrics, answers locally and records assistance", async ({
  page,
}) => {
  await enterCounselor(page);
  await page.getByRole("button", { name: "查看 林知夏 的就业材料" }).click();
  await page.getByRole("button", { name: "撤销审批" }).click();
  const revoke = page.getByRole("dialog", { name: "撤销本次审批" });
  await revoke.getByRole("textbox", { name: "撤销原因" }).fill("学生材料需要重新核对，进入帮扶跟进流程。");
  await revoke.getByRole("button", { name: "确认撤销" }).click();

  await page.getByRole("link", { name: "就业驾驶舱" }).click();
  await expect(
    page.getByRole("heading", { name: "从整体趋势，到需要被看见的一个人。" }),
  ).toBeVisible();
  await expect(page.getByTestId("destination-rate")).toHaveText("90.0%");
  await page.getByRole("textbox", { name: "问一个就业数据问题" }).fill("当前去向落实率是多少");
  await page.getByRole("button", { name: "本地问数" }).click();
  await expect(page.getByRole("status")).toContainText("90.0%");
  await page.getByRole("button", { name: "生成问数解读" }).click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.locator('.ai-block')).toHaveCount(0);

  await page.getByRole("button", { name: "记录 林知夏 的帮扶行动" }).click();
  const help = page.getByRole("dialog", { name: "记录帮扶行动" });
  await help.getByRole("textbox", { name: "帮扶记录" }).fill("联系学生核对升学与就业选择，并约定补齐证明材料。");
  await help.getByLabel("下次复查时间").fill("2026-11-16T10:00");
  await help.getByRole("button", { name: "保存帮扶" }).click();
  await expect(page.getByRole("status")).toContainText("帮扶已记录");
});
