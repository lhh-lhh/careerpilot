import { test, expect } from "@playwright/test";

test("E07 admin sees versions, downloads redacted audit and can restore the fixed demo", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "管理员", exact: true }).click();
  await page.getByRole("button", { name: "以管理员身份进入" }).click();
  await expect(
    page.getByRole("heading", { name: "让演示环境透明、可追溯、可复位。" }),
  ).toBeVisible();
  await expect(page.getByText("Schema 1.0", { exact: true })).toBeVisible();
  await expect(page.getByText("固定虚构种子", { exact: true })).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出脱敏审计" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^careerpilot-audit-/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString("utf8");
  expect(exported).not.toContain("commandId");
  expect(exported).not.toContain("actorUserId");

  await page.getByRole("button", { name: "复位演示环境" }).click();
  const dialog = page.getByRole("dialog", { name: "复位整个演示环境" });
  await dialog.getByRole("checkbox", { name: "我理解本机修改将被清除" }).check();
  await dialog.getByRole("button", { name: "确认复位" }).click();
  await expect(page.getByRole("heading", { name: "选择演示角色" })).toBeVisible();
});

test("E07 admin audit remains readable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "管理员", exact: true }).click();
  await page.getByRole("button", { name: "以管理员身份进入" }).click();

  const audit = page.getByRole("list", { name: "最近脱敏审计记录" });
  await expect(audit).toBeVisible();
  await expect(audit.getByRole("listitem").first()).toContainText(
    /时间.*对象.*动作.*结果/s,
  );
  await expect
    .poll(() =>
      page.locator(".audit-section").evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true);
});
