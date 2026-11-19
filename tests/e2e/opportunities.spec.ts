import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeService } from "../../server/bootstrap";
import { createOnlineApp } from "../../server/app";
import { createSqlDatabase } from "../../server/database";
import { createOpportunities } from "../../server/opportunities";
import { parseNcssList } from "../../server/ncss";
test("public discovery, login return, explicit personal record, second session and admin withdrawal", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "careerpilot-opportunity-ui-")),
    path = join(root, "db.sqlite");
  await initializeService(path);
  const db = createSqlDatabase(path),
    service = createOpportunities(db);
  await service.stage(
    parseNcssList(
      {
        data: {
          list: [
            {
              jobId: "browser123",
              jobName: "开发工程师",
              recName: "远行技术",
              areaCodeName: "上海市",
              degreeName: "本科及以上",
              major: "计算机类",
              sourcesNameCh: "智联招聘",
            },
          ],
        },
      },
      new Date().toISOString(),
    ),
  );
  const entry = (
    await service.admin({ userId: "user-admin-001", role: "admin" })
  ).entries[0]!;
  expect(entry.status).toBe("pending");
  await db.close();
  const app = await createOnlineApp({
    databasePath: path,
    staticRoot: resolve(process.env.CAREERPILOT_TEST_DIST ?? "dist"),
  });
  for (const login of ["admin", "student.chen"])
    await app.provision(login, "Opportunity-browser-Password!");
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`;
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, b, admin] = await Promise.all(contexts.map((c) => c.newPage()));
  async function signIn(page: NonNullable<typeof a>, name: string) {
    await page.getByLabel("账号", { exact: true }).fill(name);
    await page
      .getByLabel("密码", { exact: true })
      .fill("Opportunity-browser-Password!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
  }
  try {
    await admin!.goto(origin + "/#/login");
    await signIn(admin!, "admin");
    await admin!
      .getByRole("link", { name: "机会来源管理", exact: true })
      .click();
    await admin!.getByText("查看新增字段", { exact: true }).click();
    await expect(admin!.getByText("计算机类", { exact: true })).toBeVisible();
    await admin!.getByLabel("审核说明").fill("核对来源与申请条件");
    await admin!.getByRole("button", { name: "发布", exact: true }).click();
    await expect(admin!.getByText("已发布", { exact: true })).toBeVisible();
    await a!.goto(origin + "/#/");
    await expect(
      a!.getByRole("heading", { name: "让下一步，更有方向。" }),
    ).toBeVisible();
    await a!.getByRole("link", { name: "岗位机会", exact: true }).click();
    await a!.getByLabel("岗位关键词").fill("开发");
    await a!.getByRole("button", { name: "搜索", exact: true }).click();
    await a!.getByRole("link", { name: "开发工程师", exact: true }).click();
    await expect(
      a!.getByRole("heading", { name: "开发工程师", exact: true }),
    ).toBeVisible();
    await expect(
      a!.getByRole("link", { name: "原站查看", exact: true }),
    ).toHaveAttribute(
      "href",
      "https://www.ncss.cn/student/jobs/browser123/detail.html",
    );
    await a!.getByRole("link", { name: "登录后关注", exact: true }).click();
    await signIn(a!, "student.chen");
    await expect(
      a!.getByRole("heading", { name: "开发工程师", exact: true }),
    ).toBeVisible();
    await a!.getByRole("button", { name: "关注岗位", exact: true }).click();
    await expect(
      a!.getByRole("button", { name: "已关注", exact: true }),
    ).toBeVisible();
    await a!.getByRole("link", { name: "我的求职记录", exact: true }).click();
    await a!.getByLabel("本人进展").selectOption("applied");
    await a!.getByLabel("进展日期").fill("2026-11-14");
    await a!.getByLabel("个人备注").fill("已在原站提交材料");
    await a!.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(a!.getByRole("status")).toContainText("已保存");
    await b!.goto(origin + "/#/login");
    await signIn(b!, "student.chen");
    await b!.goto(origin + "/#/student/opportunities");
    await expect(b!.getByLabel("个人备注")).toHaveValue("已在原站提交材料");
    await expect(b!.getByLabel("本人进展")).toHaveValue("applied");
    await b!.getByLabel("个人备注").fill("另一设备未保存的输入");
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    await a!.route("**/api/opportunity-records", async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    });
    await a!.getByLabel("个人备注").fill("第一设备更新");
    await a!.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(a!.getByLabel("个人备注")).toBeDisabled();
    await expect(
      a!.getByRole("button", { name: "重新读取", exact: true }),
    ).toBeDisabled();
    releaseWrite();
    await expect(a!.getByLabel("个人备注")).toBeEnabled();
    await a!.unroute("**/api/opportunity-records");
    await expect(b!.getByLabel("个人备注")).toHaveValue("另一设备未保存的输入");
    await b!.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(b!.getByRole("alert")).toContainText("保存未完成");
    await expect(b!.getByLabel("个人备注")).toHaveValue("另一设备未保存的输入");
    await b!.getByRole("button", { name: "重新读取", exact: true }).click();
    await expect(b!.getByLabel("个人备注")).toHaveValue("第一设备更新");
    await admin!.getByLabel("审核说明").fill("需要重新核对");
    await admin!.getByRole("button", { name: "下架", exact: true }).click();
    await expect(b!.getByText("已下架", { exact: true })).toBeVisible();
    await a!.goto(origin + "/#/");
    await a!.setViewportSize({ width: 390, height: 844 });
    await expect(
      a!.getByRole("link", { name: "岗位机会", exact: true }),
    ).toBeVisible();
    expect(
      await a!.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(a!.locator("body")).not.toContainText("虚构");
    await expect(a!.locator("body")).not.toContainText("演示");
  } finally {
    for (const context of contexts) await context.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a delayed previous detail response cannot replace the newly selected opportunity", async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), "careerpilot-detail-race-")),
    path = join(root, "db.sqlite");
  await initializeService(path);
  const db = createSqlDatabase(path),
    service = createOpportunities(db),
    actor = { userId: "user-admin-001", role: "admin" } as const;
  await service.stage(
    parseNcssList(
      {
        data: {
          list: [
            { jobId: "first", jobName: "先前岗位", recName: "企业一" },
            { jobId: "second", jobName: "当前岗位", recName: "企业二" },
          ],
        },
      },
      new Date().toISOString(),
    ),
  );
  for (const row of (await service.admin(actor)).entries)
    await service.review(actor, {
      id: row.id,
      expectedRevision: row.revision,
      commandId: row.id,
      decision: "publish",
      reason: "隔离核对",
    });
  await db.close();
  const app = await createOnlineApp({
    databasePath: path,
    staticRoot: resolve(process.env.CAREERPILOT_TEST_DIST ?? "dist"),
  });
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("port");
  const context = await browser.newContext(),
    page = await context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let requestStarted!: () => void;
  const started = new Promise<void>((r) => {
    requestStarted = r;
  });
  await page.route(
    "**/api/public/opportunities/ncss%3Afirst",
    async (route) => {
      requestStarted();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ncss:first",
          title: "先前岗位",
          kind: "external",
          employer: "企业一",
          availability: "available",
        }),
      });
    },
  );
  try {
    await page.goto(
      `http://127.0.0.1:${address.port}/#/opportunities/ncss:first`,
    );
    await started;
    await page.evaluate(() => {
      location.hash = "/opportunities/ncss:second";
    });
    await expect(
      page.getByRole("heading", { name: "当前岗位", exact: true }),
    ).toBeVisible();
    release();
    await expect
      .poll(async () => page.locator("h1").textContent())
      .toBe("当前岗位");
    await page.getByRole("link", { name: "返回岗位列表", exact: true }).click();
    await page.getByRole("link", { name: "当前岗位", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "当前岗位", exact: true }),
    ).toBeVisible();
  } finally {
    release();
    await context.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
