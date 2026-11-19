import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page, role: "学生" | "辅导员") {
  await page.goto("/#/login");
  if (role === "辅导员")
    await page.getByRole("radio", { name: role, exact: true }).click();
  await page.getByRole("button", { name: `以${role}身份进入` }).click();
}

test("E05 independent further-study destination is submitted by the student and approved in counselor scope", async ({
  page,
}) => {
  await enter(page, "辅导员");
  await expect(
    page.getByRole("heading", { name: "看见材料，也看见背后的人。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看 林知夏 的就业材料" }).click();
  await page.getByRole("button", { name: "撤销审批" }).click();
  const revoke = page.getByRole("dialog", { name: "撤销本次审批" });
  await revoke
    .getByRole("textbox", { name: "撤销原因" })
    .fill("学生申请调整为升学去向，需重新核对证明材料。");
  await revoke.getByRole("button", { name: "确认撤销" }).click();
  await expect(page.getByRole("status")).toContainText("已撤销审批");

  await page.getByRole("button", { name: "退出演示" }).click();
  await enter(page, "学生");
  await page.getByRole("link", { name: "协议与去向" }).click();
  await page.getByLabel("毕业去向类型").selectOption("furtherStudy");
  await page.getByRole("textbox", { name: "升学单位" }).fill("示例大学研究院");
  await page.getByLabel("证明材料").setInputFiles({
    name: "录取证明.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("teaching proof"),
  });
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.getByRole("button", { name: "提交辅导员审核" }).click();
  await expect(page.getByRole("status")).toContainText("已提交审核");

  await page.getByRole("button", { name: "退出演示" }).click();
  await enter(page, "辅导员");
  await page.getByRole("button", { name: "查看 林知夏 的就业材料" }).click();
  await expect(page.getByText("示例大学研究院", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "通过审核" }).click();
  await expect(page.getByRole("status")).toContainText("审核已通过");
  await page.reload();
  await expect(page.locator(".student-review").getByText("已通过", { exact: true }).first()).toBeVisible();
});
