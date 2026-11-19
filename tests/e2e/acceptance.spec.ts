import { test, expect, type Page } from "@playwright/test";

async function enterStudent(page: Page) {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await expect(page.getByRole("link", { name: "继续完善简历" })).toBeVisible();
}

async function enterCounselor(page: Page) {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "辅导员", exact: true }).click();
  await page.getByRole("button", { name: "以辅导员身份进入" }).click();
  await expect(
    page.getByRole("heading", {
      name: "看见材料，也看见背后的人。",
    }),
  ).toBeVisible();
}

async function enterAdmin(page: Page) {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "管理员", exact: true }).click();
  await page.getByRole("button", { name: "以管理员身份进入" }).click();
  await expect(
    page.getByRole("heading", { name: "让演示环境透明、可追溯、可复位。" }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("V02 effective 200% layout keeps core pages and mobile navigation usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await enterStudent(page);

  for (const [route, heading, action, actionRole] of [
    ["", "让下一步，更有方向。", "继续完善简历", "link"],
    ["resume", "把经历，写成你的优势。", "打印简历", "button"],
    ["jobs", "找到适合你的下一站。", "查看匹配依据", "button"],
  ] as const) {
    await page.goto(`/#/student/${route}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const keyAction = page.getByRole(actionRole, { name: action }).first();
    await keyAction.scrollIntoViewIfNeeded();
    await expect(keyAction).toBeVisible();
  }

  const menu = page.getByRole("button", { name: "打开导航" });
  await menu.click();
  await expect(page.getByRole("dialog", { name: "工作空间" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  await enterCounselor(page);
  await page.goto("/#/counselor/dashboard");
  await expect(
    page.getByRole("heading", {
      name: "从整体趋势，到需要被看见的一个人。",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "本地问数" })).toBeVisible();

  await page.goto("/#/design-system");
  await expect(
    page.getByRole("heading", { name: "清晰，是最好的指引。" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("V04 print layouts hide application chrome and keep five key pages readable", async ({
  page,
}) => {
  await enterStudent(page);
  for (const [route, heading] of [
    ["", "让下一步，更有方向。"],
    ["resume", "把经历，写成你的优势。"],
    ["jobs", "找到适合你的下一站。"],
  ] as const) {
    await page.emulateMedia({ media: "screen" });
    await page.goto(`/#/student/${route}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.emulateMedia({ media: "screen" });
  await enterCounselor(page);
  await page.goto("/#/counselor/dashboard");
  await expect(page.locator('.chart-canvas[role="img"] svg')).toHaveCount(4);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator('.chart-canvas[role="img"] svg')).toHaveCount(4);
  await expectNoHorizontalOverflow(page);

  await page.emulateMedia({ media: "screen" });
  await page.goto("/#/design-system");
  await expect(
    page.getByRole("heading", { name: "清晰，是最好的指引。" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { name: "清晰，是最好的指引。" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "打开抽屉演示" })).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test("E08 offline A1 A2 A3 A7 fail closed without external calls or synthetic AI results", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await enterStudent(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("careerpilot-demo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("aiRuns", "readwrite");
      transaction.objectStore("aiRuns").clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.goto("/#/student/resume");
  await page
    .getByRole("textbox", { name: "项目描述 1", exact: true })
    .fill("E08离线验证：负责页面开发，完成5个页面并记录2轮核对。 ");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("button", { name: "生成表达建议", exact: true }).click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.locator('.ai-block')).toHaveCount(0);

  await page.goto("/#/student/jobs");
  await expect(page.getByText("正在重新计算…")).toBeHidden();
  await page.getByRole("button", { name: "查看匹配依据" }).nth(1).click();
  await page.getByRole("button", { name: "生成文字解释" }).click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.locator('.ai-block')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const a3Run = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("careerpilot-demo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = db.transaction("aiRuns").objectStore("aiRuns").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.find((row) => row.module === "A3");
  });
  expect(a3Run).toBeUndefined();

  await page.goto("/#/student/mock");
  await page.getByRole("button", { name: "开始新练习", exact: true }).click();
  await page
    .getByRole("textbox", { name: "我的回答", exact: true })
    .fill("E08离线回答：我负责需求核对与页面开发，交付5个页面并完成2轮复查。");
  await page.getByRole("button", { name: "提交回答", exact: true }).click();
  await page.getByRole("button", { name: "提前结束" }).click();
  await page
    .getByRole("dialog", { name: "提前结束本次练习" })
    .getByRole("button", { name: "生成部分报告" })
    .click();
  await page.getByRole("button", { name: "生成文字反馈" }).first().click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.locator('.ai-block')).toHaveCount(0);

  await page.getByRole("button", { name: "退出演示" }).click();
  await enterCounselor(page);
  await page.goto("/#/counselor/dashboard");
  await page
    .getByRole("textbox", { name: "问一个就业数据问题" })
    .fill("E08验证：当前去向落实率是多少");
  await page.getByRole("button", { name: "生成问数解读" }).click();
  await expect(page.getByRole('alert').filter({hasText:'在线DeepSeek'})).toBeVisible();
  await expect(page.locator('.ai-block')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

type ResetSnapshot = {
  hash: string;
  counts: Record<string, number>;
  configs: Record<string, unknown>;
};

async function databaseSnapshot(page: Page): Promise<ResetSnapshot> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("careerpilot-demo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = [...db.objectStoreNames].sort();
    const payload: Record<string, unknown[]> = {};
    for (const name of names) {
      payload[name] = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const configs = Object.fromEntries(
      (payload.configs as { key: string; value: unknown }[]).map((row) => [
        row.key,
        row.value,
      ]),
    );
    return {
      hash,
      configs,
      counts: Object.fromEntries(
        Object.entries(payload).map(([name, rows]) => [name, rows.length]),
      ),
    };
  });
}

async function resetOnce(page: Page) {
  await enterAdmin(page);
  await page.getByRole("button", { name: "复位演示环境" }).click();
  const dialog = page.getByRole("dialog", { name: "复位整个演示环境" });
  await dialog
    .getByRole("checkbox", { name: "我理解本机修改将被清除" })
    .check();
  await dialog.getByRole("button", { name: "确认复位" }).click();
  await expect(page).toHaveURL(/login/);
  return databaseSnapshot(page);
}

test("E09 two full seed resets preserve counts, domain fingerprint and REPLAY defaults", async ({
  page,
}) => {
  const first = await resetOnce(page);
  const second = await resetOnce(page);
  expect(first.counts.students).toBe(40);
  expect(first.counts.jobs).toBe(100);
  expect(first.configs.aiMode).toBe("REPLAY");
  expect(first.configs.fixedNow).toBe(second.configs.fixedNow);
  expect(second.counts).toEqual(first.counts);
  expect(second.configs).toEqual(first.configs);
  expect(second.hash).toBe(first.hash);
});
