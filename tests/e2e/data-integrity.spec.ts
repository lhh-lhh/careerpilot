import { test, expect } from "@playwright/test";
test("D02 real IndexedDB resume edit persists after reload and retains initial version", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  await expect(
    page.getByRole("heading", { name: "你的本机数据，清楚可见。" }),
  ).toBeVisible();
  await page.getByLabel("演示简历姓名").fill("林知夏·持久化验证");
  await page.getByRole("button", { name: "保存检查草稿" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(page.getByLabel("演示简历姓名")).toHaveValue(
    "林知夏·持久化验证",
  );
  await expect(page.getByText("保留初始版本：是")).toBeVisible();
  await page.screenshot({
    path: "artifacts/visual/data-check-desktop.png",
    fullPage: true,
  });
});
test("S02 erase requires explicit confirmation, logs out and keeps other demo accounts", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  await page.getByRole("button", { name: "清除本人演示数据" }).click();
  const dialog = page.getByRole("dialog", { name: "清除本人的演示数据？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "确认清除本人" }).click();
  await expect(page).toHaveURL(/login/);
  await page.getByRole("radio", { name: "管理员", exact: true }).click();
  await page.getByRole("button", { name: "以管理员身份进入" }).click();
  await page.goto("/#/admin/data-check");
  await expect(page.getByText("39 位学生")).toBeVisible();
  await page.getByRole("button", { name: "复位完整虚构种子" }).click();
  await page
    .getByRole("dialog", { name: "复位整个演示环境？" })
    .getByRole("button", { name: "确认复位" })
    .click();
  await expect(page).toHaveURL(/login/);
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  await expect(page.getByLabel("演示简历姓名")).toHaveValue("林知夏");
});
test("D03 two tabs keep stale edits and reject overwrite until explicit reread", async ({
  page,
  context,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  const other = await context.newPage();
  await other.goto("/#/login");
  await other.getByRole("button", { name: "以学生身份进入" }).click();
  await other.goto("/#/student/data-check");
  await other.getByLabel("演示简历姓名").fill("标签乙未保存输入");
  await page.getByLabel("演示简历姓名").fill("标签甲已保存版本");
  await page.getByRole("button", { name: "保存检查草稿" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(other.getByRole("alert")).toContainText("当前输入未覆盖");
  await other.getByRole("button", { name: "保存检查草稿" }).click();
  await expect(
    other.getByText(
      "其他标签页已修改此简历。当前输入保留，请重新读取后核对再保存。",
    ),
  ).toBeVisible();
  await expect(other.getByLabel("演示简历姓名")).toHaveValue(
    "标签乙未保存输入",
  );
  await other.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(other.getByLabel("演示简历姓名")).toHaveValue(
    "标签甲已保存版本",
  );
});
test("D06 PDF Blob reload rebuilds a readable URL; invalid uploads retain the existing attachment", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  await page.getByLabel("证明文件检查").setInputFiles({
    name: "teaching-proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n fictional teaching upload\n%%EOF"),
  });
  await expect(page.getByRole("status")).toContainText("附件已保存");
  await page.reload();
  const link = page.getByRole("link", { name: "打开附件 teaching-proof.pdf" });
  await expect(link).toHaveAttribute("href", /^blob:/);
  const downloading = page.waitForEvent("download");
  await link.click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("teaching-proof.pdf");
  const stream = await downloaded.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toContain("%PDF-1.4");
  await page.getByLabel("证明文件检查").setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(2097153),
  });
  await expect(page.getByRole("alert")).toContainText("2MiB");
  await expect(link).toBeVisible();
  await page.getByLabel("证明文件检查").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not allowed"),
  });
  await expect(page.getByRole("alert")).toContainText("PDF、PNG或JPEG");
  await expect(link).toBeVisible();
});
test("D07 a blocked database upgrade displays recovery guidance without erasing an existing store", async ({
  page,
  context,
}) => {
  const holderPage = await context.newPage();
  await holderPage.goto("/#/login");
  await holderPage.evaluate(async () => {
    const holder = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("careerpilot-demo", 1);
      request.onupgradeneeded = () =>
        request.result
          .createObjectStore("users", { keyPath: "id" })
          .add({ id: "legacy-user", marker: "preserve-existing-data" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    Object.assign(window, { testUpgradeHolder: holder });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "careerpilot-session",
      JSON.stringify({ role: "student", userId: "user-student-001" }),
    );
  });
  await page.goto("/#/student/data-check");
  await expect(page.getByRole("alert")).toContainText(
    "数据库升级被其他标签页阻止",
  );
  await holderPage.evaluate(() => {
    (
      window as unknown as { testUpgradeHolder: IDBDatabase }
    ).testUpgradeHolder.close();
  });
  await holderPage.close();
  await expect(page.getByRole("alert")).toBeVisible();
  const marker = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("careerpilot-demo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction("users")
        .objectStore("users")
        .get("legacy-user");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  });
  expect(marker).toMatchObject({ marker: "preserve-existing-data" });
});
