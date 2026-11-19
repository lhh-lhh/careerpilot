import { test, expect } from "@playwright/test";

test("B02 anonymous hash deep link reaches role selection, not a server 404", async ({
  page,
}) => {
  await page.goto("/#/student/resume");
  await expect(
    page.getByRole("heading", { name: "选择演示角色" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "选择演示角色" }),
  ).toBeVisible();
});

test("B01 login has four roles and makes no external requests", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      external.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/#/login");
  for (const role of ["学生", "企业", "辅导员", "管理员"])
    await expect(
      page.getByRole("radio", { name: role, exact: true }),
    ).toBeVisible();
  expect(external).toEqual([]);
});

test("B04 student session persists refresh and cannot read administrator route", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.goto("/#/admin");
  await expect(
    page.getByRole("heading", { name: "暂无访问权限" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "退出演示" })).toBeVisible();
});

test("B02 each supported actor reaches its own workspace", async ({ page }) => {
  for (const role of ["企业", "辅导员", "管理员"]) {
    await page.goto("/#/login");
    await page.getByRole("radio", { name: role, exact: true }).click();
    await page.getByRole("button", { name: `以${role}身份进入` }).click();
    await expect(
      page.getByRole("navigation", { name: "主导航" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出演示" }).click();
    await expect(
      page.getByRole("heading", { name: "选择演示角色" }),
    ).toBeVisible();
  }
});

test("unknown hash displays an honest not-found screen", async ({ page }) => {
  await page.goto("/#/not-a-real-page");
  await expect(
    page.getByRole("heading", { name: "这段路径还没有方向" }),
  ).toBeVisible();
});
