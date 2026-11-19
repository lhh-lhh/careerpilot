import { expect, test } from "@playwright/test";

test("E08 student can clear only their own browser data from help", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "学生", exact: true }).click();
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("button", { name: "帮助与说明" }).click();
  const help = page.getByRole("dialog", { name: "帮助与说明" });
  await help.getByRole("button", { name: "清除我的本机数据" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "清除我的本机数据",
  });
  await confirmation
    .getByRole("checkbox", { name: "我理解该学生的本机数据将被删除" })
    .check();
  await confirmation.getByRole("button", { name: "确认清除" }).click();
  await expect(
    page.getByRole("heading", { name: "选择演示角色" }),
  ).toBeVisible();
});
