import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOnlineApp } from "../../server/app";
test("independent student and administrator complete a service ticket with a durable reply", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "careerpilot-ticket-ui-"));
  const app = await createOnlineApp({
    databasePath: join(root, "db.sqlite"),
    seed: true,
    staticRoot: resolve("dist"),
  });
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    for (const login of ["student001", "admin"])
      await app.provision(login, "Test-only-ticket-password!");
    await app.listen(0);
    const address = app.server.address();
    if (!address || typeof address === "string") throw Error("no port");
    const origin = `http://127.0.0.1:${address.port}`,
      pages = await Promise.all(contexts.map((c) => c.newPage()));
    const [student, admin] = pages;
    if (!student || !admin) throw Error("no pages");
    for (const [page, login] of [
      [student, "student001"],
      [admin, "admin"],
    ] as const) {
      await page.goto(origin + "/#/login");
      await page
        .getByRole("textbox", { name: "账号", exact: true })
        .fill(login);
      await page
        .getByLabel("密码", { exact: true })
        .fill("Test-only-ticket-password!");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.getByRole("link", { name: "站内服务", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: login === 'admin' ? '让每一个问题，都得到明确回应。' : '遇到问题，有迹可循地解决。', exact: true }),
      ).toBeVisible();
    }
    await student
      .getByLabel("问题说明", { exact: true })
      .fill("请协助确认投递记录的核对入口。");
    await student
      .getByRole("button", { name: "提交工单", exact: true })
      .click();
    await expect(student.getByRole("status")).toContainText("工单已提交");
    await admin.getByRole("button", { name: "查看工单", exact: true }).click();
    let dialog = admin.getByRole("dialog", { name: "工单详情" });
    await expect(dialog).toContainText("请协助确认投递记录的核对入口。");
    const replyBox = await dialog
      .getByLabel("办理说明", { exact: true })
      .boundingBox();
    expect(replyBox?.height).toBeGreaterThanOrEqual(120);
    expect(replyBox?.width).toBeGreaterThan(350);
    await dialog
      .getByLabel("办理说明", { exact: true })
      .fill("请进入我的投递查看业务时间线，如有问题可以重开。");
    await dialog.getByRole("button", { name: "答复工单", exact: true }).click();
    await expect(admin.getByRole("status")).toContainText("工单已更新");
    await admin.getByRole("button", { name: "查看工单", exact: true }).click();
    dialog = admin.getByRole("dialog", { name: "工单详情" });
    await dialog.getByLabel("办理说明", { exact: true }).fill("已完成指引。");
    await dialog.getByRole("button", { name: "结案", exact: true }).click();
    await student.reload();
    await student
      .getByRole("button", { name: "查看工单", exact: true })
      .click();
    dialog = student.getByRole("dialog", { name: "工单详情" });
    await expect(dialog).toContainText(
      "请进入我的投递查看业务时间线，如有问题可以重开。",
    );
    await expect(dialog).toContainText("已结案");
    await dialog
      .getByLabel("办理说明", { exact: true })
      .fill("仍需帮助确认历史投递记录。");
    await dialog.getByRole("button", { name: "重开工单", exact: true }).click();
    await expect(student.getByRole("status")).toContainText("工单已更新");
    await student.setViewportSize({ width: 375, height: 812 });
    expect(
      await student.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  } finally {
    for (const c of contexts) await c.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
