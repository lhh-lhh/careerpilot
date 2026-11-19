import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOnlineApp } from "../../server/app";
test("certificate thumbnails open a preview and expression advice is next to the editor", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("link", { name: "简历工作台", exact: true }).click();
  await page.getByRole("button", { name: "添加证书", exact: true }).click();
  const row = page.locator("#resume-certificates .entry").last();
  await row.getByLabel("证书名称", { exact: true }).fill("隔离图片证书");
  await row.getByLabel("颁发机构", { exact: true }).fill("隔离测试");
  await row.getByLabel("获得日期", { exact: true }).fill("2026-01-01");
  await row.getByLabel("上传证书文件", { exact: true }).setInputFiles({
    name: "preview.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await row
    .getByRole("button", { name: "预览 preview.png", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "证书文件预览" })
      .getByRole("img", { name: "preview.png", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await row.getByLabel("上传证书文件", { exact: true }).setInputFiles({
    name: "damaged.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-isolated-damaged-file"),
  });
  await row
    .getByRole("button", { name: "预览 damaged.pdf", exact: true })
    .click();
  const damaged = page.getByRole("dialog", { name: "证书文件预览" });
  await expect(damaged.getByRole("alert")).toContainText("请下载原文件查看");
  const original = page.waitForEvent("download");
  await damaged
    .getByRole("button", { name: "下载原文件", exact: true })
    .click();
  expect((await original).suggestedFilename()).toBe("damaged.pdf");
  await damaged.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("button", { name: "生成表达建议", exact: true }).click();
  await expect(page).toHaveURL(/resume\/suggestions/);
  const panel = page.getByRole("region", { name: "表达建议子页", exact: true });
  await expect(
    panel.getByRole("heading", { name: "改写对照", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('alert')).toContainText('在线DeepSeek');
  await expect(panel.getByRole('button',{name:'采纳建议',exact:true})).toHaveCount(0);
  expect(
    await panel.evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(700);
  await expect(page.getByLabel("项目描述 1", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "表达建议子页", exact: true }).click();
  expect(
    await panel.evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(700);
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("项目描述 1", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "编辑主页面", exact: true }).click();
  await expect(page.getByLabel("项目描述 1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("resume preview downloads a PDF and supports a narrow viewport", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("link", { name: "简历工作台", exact: true }).click();
  await page.getByRole("link", { name: "预览与导出简历", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "精致简历卡片", exact: true }),
  ).toContainText("教育经历");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "一键导出PDF", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await download.saveAs(test.info().outputPath("exported-resume.pdf"));
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
  await page.getByRole("link", { name: "返回简历工作台", exact: true }).click();
  await page.getByRole("button", { name: "添加证书", exact: true }).click();
  const row = page.locator("#resume-certificates .entry").last();
  await row.getByLabel("证书名称", { exact: true }).fill("隔离有效PDF预览");
  await row.getByLabel("上传证书文件", { exact: true }).setInputFiles({
    name: "valid-preview.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await row
    .getByRole("button", { name: "预览 valid-preview.pdf", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "证书文件预览" });
  await expect(modal).toBeVisible();
  const pdfPage = modal.getByRole("img", { name: "PDF第1页", exact: true });
  await expect(pdfPage).toBeVisible();
  await expect(
    modal.getByRole("region", { name: "PDF文件预览", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  expect(
    await pdfPage.evaluate((el) => (el as HTMLCanvasElement).width),
  ).toBeGreaterThan(500);
  expect(
    await pdfPage.evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! < 200 && pixels[i + 3]! > 0) colored++;
      return colored;
    }),
  ).toBeGreaterThan(1000);
  await page.screenshot({
    path: test.info().outputPath("certificate-pdf-preview.png"),
  });
  await modal.getByRole("button", { name: "关闭", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("long resume exports all pages and incomplete education blocks export", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("link", { name: "简历工作台", exact: true }).click();
  await page
    .getByLabel("项目描述 1", { exact: true })
    .fill(
      "负责真实需求梳理、组件实现与验证。\n".repeat(100) +
        "最终成果保留在最后一页",
    );
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("link", { name: "预览与导出简历", exact: true }).click();
  const sheets = page
    .getByRole("region", { name: "精致简历卡片" })
    .getByRole("img");
  await expect.poll(() => sheets.count()).toBeGreaterThan(1);
  await expect(sheets).toContainText(["最终成果保留在最后一页"]);
  const received = page.waitForEvent("download");
  await page.getByRole("button", { name: "一键导出PDF", exact: true }).click();
  const download = await received;
  await download.saveAs(test.info().outputPath("long-resume.pdf"));
  const pdfStream = await download.createReadStream();
  const pdfChunks: Buffer[] = [];
  for await (const chunk of pdfStream!) pdfChunks.push(Buffer.from(chunk));
  await page.getByRole("link", { name: "返回简历工作台", exact: true }).click();
  await page.getByRole("button", { name: "添加证书", exact: true }).click();
  const certificate = page.locator("#resume-certificates .entry").last();
  await certificate.getByLabel("上传证书文件", { exact: true }).setInputFiles({
    name: "multiple-pages.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(pdfChunks),
  });
  await certificate
    .getByRole("button", { name: "预览 multiple-pages.pdf", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "证书文件预览" });
  const next = modal.getByRole("button", { name: "下一页", exact: true });
  await expect(next).toBeEnabled();
  await expect(
    modal.getByRole("button", { name: "上一页", exact: true }),
  ).toBeDisabled();
  await next.click();
  await expect(
    modal.getByRole("img", { name: "PDF第2页", exact: true }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(
    modal.getByRole("img", { name: "PDF第1页", exact: true }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "关闭", exact: true }).click();
  await certificate
    .getByRole("button", { name: "移除此证书", exact: true })
    .click();
  await page
    .getByRole("button", { name: "移除此教育经历", exact: true })
    .click();
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("link", { name: "预览与导出简历", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "一键导出PDF", exact: true }),
  ).toBeDisabled();
});

test("the employer and student see the same immutable application card after a later resume edit", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/jobs");
  await page
    .getByRole("button", { name: "投递岗位", exact: true })
    .first()
    .click();
  const confirm = page.getByRole("dialog", { name: "确认投递当前简历" });
  await expect(
    confirm.getByRole("region", { name: "精致简历卡片" }),
  ).toBeVisible();
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "确认投递", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("投递成功");
  await page.goto("/#/student/applications");
  await page.getByText("查看已投递简历卡片", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "精致简历卡片" }),
  ).toBeVisible();
  await page.goto("/#/student/resume");
  await page
    .getByLabel("项目描述 1", { exact: true })
    .fill("仅在投递后编辑的新版本标记");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "企业", exact: true }).click();
  await page.getByRole("button", { name: "以企业身份进入" }).click();
  await page.goto("/#/company/candidates");
  await page.getByText("查看完整简历卡片", { exact: true }).click();
  const card = page.getByRole("region", { name: "精致简历卡片" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("教育经历");
  await expect(card).not.toContainText("仅在投递后编辑的新版本标记");
  await expect(card).toContainText("[已脱敏]");
});

test("online certificate preview and received resume PDF keep authorization and snapshot facts", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "cp-studio-online-"));
  const app = await createOnlineApp({
    databasePath: join(root, "db.sqlite"),
    seed: true,
    staticRoot: resolve("dist"),
  });
  const student = await browser.newContext(),
    company = await browser.newContext();
  try {
    await app.provision("student040", "Isolated-studio-password!");
    await app.provision("company1", "Isolated-studio-password!");
    await app.listen(0);
    const address = app.server.address();
    if (!address || typeof address === "string") throw Error("port");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await student.newPage();
    await page.goto(origin + "/#/login");
    await page.getByLabel("账号", { exact: true }).fill("student040");
    await page
      .getByLabel("密码", { exact: true })
      .fill("Isolated-studio-password!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("link", { name: "简历工作台", exact: true }).click();
    await page
      .getByLabel("项目描述 1", { exact: true })
      .fill("投递时的在线快照成果：完成4个组件。");
    await page.getByRole("button", { name: "添加证书", exact: true }).click();
    const row = page.locator("#resume-certificates .entry").last();
    await row.getByLabel("证书名称", { exact: true }).fill("隔离在线证书");
    await row.getByLabel("颁发机构", { exact: true }).fill("测试机构");
    await row.getByLabel("获得日期", { exact: true }).fill("2026-01-01");
    await row.getByLabel("上传证书文件", { exact: true }).setInputFiles({
      name: "online.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      row.getByRole("button", { name: "预览 online.png", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "保存新版本", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已保存");
    await page.goto(origin + "/#/student/jobs");
    await page
      .getByRole("button", { name: "投递岗位", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "确认投递当前简历" });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "确认投递", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("投递成功");
    await page.goto(origin + "/#/student/resume");
    await page
      .getByLabel("项目描述 1", { exact: true })
      .fill("投递后新版，不得泄漏到旧快照");
    await page.getByRole("button", { name: "保存新版本", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已保存");
    const employer = await company.newPage();
    await employer.goto(origin + "/#/login");
    await employer.getByLabel("账号", { exact: true }).fill("company1");
    await employer
      .getByLabel("密码", { exact: true })
      .fill("Isolated-studio-password!");
    await employer.getByRole("button", { name: "登录", exact: true }).click();
    await employer.goto(origin + "/#/company/candidates");
    const application = (
      await (
        await student.request.get(origin + "/api/read/listApplications")
      ).json()
    ).find((a: { resumeSnapshot: { certificates: { name: string }[] } }) =>
      a.resumeSnapshot.certificates.some((c) => c.name === "隔离在线证书"),
    );
    await employer.goto(
      origin + "/#/company/candidates?application=" + application.id,
    );
    await employer.getByText("查看完整简历卡片", { exact: true }).click();
    const card = employer.getByRole("region", { name: "精致简历卡片" });
    await expect(card).toContainText("投递时的在线快照成果");
    await expect(card).not.toContainText("投递后新版");
    await expect(card).toContainText("[已脱敏]");
    await employer
      .getByRole("button", { name: "预览 online.png", exact: true })
      .click();
    await expect(
      employer
        .getByRole("dialog", { name: "证书文件预览" })
        .getByRole("img", { name: "online.png", exact: true }),
    ).toBeVisible();
    await employer
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    const received = employer.waitForEvent("download");
    await card
      .getByRole("button", { name: "一键导出PDF", exact: true })
      .click();
    expect((await received).suggestedFilename()).toMatch(/\.pdf$/);
  } finally {
    await student.close();
    await company.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
