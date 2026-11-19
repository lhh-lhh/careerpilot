import { test, expect } from "@playwright/test";
test("GW12 shared connection dialog stays offline until paid test and enable, refresh forgets token", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    const body =
      url.pathname === "/api/pair"
        ? {
            token: "fake-browser-token",
            expiresAt: "2099-01-01T00:00:00Z",
            gatewayInstanceId: "test-browser",
          }
        : url.pathname === "/api/ai/providers"
          ? {
              providerId: "deepseek",
              model: "deepseek-flash",
              configured: true,
              liveEnabled: true,
              gatewayInstanceId: "test-browser",
            }
          : {
              status: "passed",
              providerId: "deepseek",
              model: "deepseek-flash",
              latencyMs: 5,
              usage: null,
            };
    await route.fulfill({
      status: url.pathname === "/api/unpair" ? 204 : 200,
      contentType: "application/json",
      body: url.pathname === "/api/unpair" ? undefined : JSON.stringify(body),
      headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" },
    });
  });
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("button", { name: "本机AI连接" }).click();
  const dialog = page.getByRole("dialog", { name: "本机 AI 连接" });
  await expect(dialog).toBeVisible();
  expect(calls).toEqual([]);
  await expect(dialog.getByRole("textbox", { name: /Key/ })).toHaveCount(0);
  await dialog.getByLabel("一次性配对码").fill("12345678");
  await dialog.getByRole("button", { name: "配对本机网关" }).click();
  await expect(dialog.getByText("已配对 · 待测试")).toBeVisible();
  expect(calls).toEqual(["/api/pair", "/api/ai/providers"]);
  const testButton = dialog.getByRole("button", { name: "执行付费连接测试" });
  await expect(testButton).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /可能产生费用/ }).check();
  await testButton.click();
  await expect(dialog.getByText("测试通过 · 待启用")).toBeVisible();
  await dialog.getByRole("button", { name: "启用本次 LIVE" }).click();
  await expect(dialog.getByText("LIVE 已启用")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "本机AI连接" }).click();
  await expect(page.getByText("未配对 · 使用本地回放")).toBeVisible();
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(persisted).not.toContain("fake-browser-token");
});
