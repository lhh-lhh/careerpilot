import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOnlineApp } from "../../server/app";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
async function fixture(browser: Browser, role: "company" | "student") {
  const root = await mkdtemp(join(tmpdir(), "cp-flow-fixes-"));
  const calls: { task: string; input: Record<string, unknown> }[] = [];
  let failQuestion = false,
    holdQuestion = false,
    questionAborted = false,
    releaseQuestion: (() => void) | undefined,
    releaseChat: (() => void) | undefined;
  const app = await createOnlineApp({
    databasePath: join(root, "test.sqlite"),
    seed: true,
    staticRoot: resolve("dist"),
    ai: {
      enabled: true,
      apiKey: "isolated-flow-not-real",
      dailyGlobalCalls: 60,
      dailyUserCalls: 50,
      transport: async (url, init) => {
        if (String(url).endsWith("/tts")) {
          calls.push({ task: "tts", input: {} });
          return new Response(new Uint8Array(4800), {
            headers: { "Content-Type": "audio/pcm" },
          });
        }
        if (String(url).endsWith("/asr")) {
          calls.push({ task: "asr", input: {} });
          return Response.json({
            text: "我负责过课程项目的页面开发与测试。",
            duration_ms: 1000,
          });
        }
        const wire = JSON.parse(String(init?.body));
        if (wire.stream) {
          calls.push({
            task: "chat",
            input: { message: wire.messages.at(-1).content },
          });
          if (wire.messages.at(-1).content === "等待重复按键检查")
            await new Promise<void>((resolve) => {
              releaseChat = resolve;
            });
          return new Response(
            'data: {"choices":[{"delta":{"content":"隔离测试的有效回复。"}}]}\n\ndata: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\ndata: [DONE]\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }
        const task = wire.messages[0].content as string,
          input = JSON.parse(wire.messages[1].content);
        calls.push({ task, input });
        if (holdQuestion)
          await new Promise<void>((resolve, reject) => {
            releaseQuestion = resolve;
            init?.signal?.addEventListener(
              "abort",
              () => {
                questionAborted = true;
                reject(Error("cancelled"));
              },
              { once: true },
            );
          });
        if (failQuestion) return new Response("{}", { status: 503 });
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  question: `请介绍你对${input.target.title}工作的理解。`,
                }),
              },
            },
          ],
        });
      },
    },
  });
  await app.provision(
    role === "company" ? "company1" : "student001",
    "Isolated-flow-test-password!",
  );
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`,
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ["microphone"],
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return {
    root,
    app,
    page,
    context,
    origin,
    calls,
    errors,
    fail: () => {
      failQuestion = true;
    },
    hold: () => {
      holdQuestion = true;
    },
    questionAborted: () => questionAborted,
    releaseQuestion: () => releaseQuestion?.(),
    release: () => releaseChat?.(),
    close: async () => {
      releaseChat?.();
      releaseQuestion?.();
      await context.close().catch(() => undefined);
      await app.close();
    },
  };
}
async function login(page: Page) {
  await page.getByLabel("账号", { exact: true }).fill("company1");
  await page
    .getByLabel("密码", { exact: true })
    .fill("Isolated-flow-test-password!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
async function studentLogin(page: Page, origin: string) {
  await page.goto(origin + "/#/login");
  await page.getByLabel("账号", { exact: true }).fill("student001");
  await page
    .getByLabel("密码", { exact: true })
    .fill("Isolated-flow-test-password!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/#\/student$/);
}

test("company login ignores a student return target but direct cross-role navigation remains forbidden", async ({
  browser,
}) => {
  const f = await fixture(browser, "company");
  try {
    await f.page.goto(f.origin + "/#/student/resume");
    await expect(f.page).toHaveURL(/login\?redirect=/);
    await login(f.page);
    await expect(f.page).toHaveURL(/#\/company$/);
    await expect(
      f.page
        .getByRole("navigation", { name: "主导航", exact: true })
        .getByRole("link", { name: "岗位管理", exact: true }),
    ).toBeVisible();
    await f.page
      .getByRole("button", { name: "AI Chatbot · 长按拖动", exact: true })
      .click();
    const panel = f.page.getByRole("dialog", { name: "全局AI助手" });
    await expect(panel.locator(".context").first()).toContainText("招聘工作台");
    await expect(panel.locator(".context").first()).not.toContainText(
      "暂无访问权限",
    );
    await panel.getByLabel("向AI助手提问").fill("岗位发布如何操作？");
    await expect(
      panel.getByRole("button", { name: "发送", exact: true }),
    ).toBeEnabled();
    await panel.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      panel.getByText("隔离测试的有效回复。", { exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "收起AI助手" }).click();
    expect(
      (
        await f.context.request.get(f.origin + "/api/workbench/sessions")
      ).status(),
    ).toBe(403);
    await f.page.screenshot({ path: join(f.root, "company-login.png") });
    await f.page.goto(f.origin + "/#/student/resume");
    await expect(f.page).toHaveURL(/#\/forbidden$/);
    await f.page
      .getByRole("link", { name: "返回我的工作台", exact: true })
      .click();
    await expect(f.page).toHaveURL(/#\/company$/);
    expect(f.calls.filter((c) => c.task === "chat")).toHaveLength(1);
    expect(f.errors).toEqual([]);
    console.log("Company QA: " + f.root);
  } finally {
    await f.close();
  }
});

test("assistant Enter sends once, Shift Enter inserts a line, IME and disabled consent do not send", async ({
  browser,
}) => {
  const f = await fixture(browser, "student");
  try {
    await studentLogin(f.page, f.origin);
    await f.page
      .getByRole("button", { name: "AI Chatbot · 长按拖动", exact: true })
      .click();
    const panel = f.page.getByRole("dialog", { name: "全局AI助手" }),
      input = panel.getByLabel("向AI助手提问");
    await input.fill("第一行");
    await expect(
      panel.getByRole("button", { name: "发送", exact: true }),
    ).toBeEnabled();
    await input.press("Shift+Enter");
    await input.press("a");
    await expect(input).toHaveValue("第一行\na");
    expect(f.calls).toHaveLength(0);
    await input.dispatchEvent("compositionstart");
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
    });
    await input.dispatchEvent("keydown", { key: "Enter", code: "Enter" });
    await input.dispatchEvent("compositionend");
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
    });
    expect(f.calls).toHaveLength(0);
    await input.fill("回车发送");
    await input.press("Enter");
    await expect(
      panel.getByText("隔离测试的有效回复。", { exact: true }),
    ).toBeVisible();
    expect(f.calls.filter((c) => c.task === "chat")).toHaveLength(1);
    await input.fill("等待重复按键检查");
    await input.press("Enter");
    await expect(input).toBeDisabled();
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      repeat: true,
    });
    f.release();
    await expect(input).toBeEnabled();
    expect(f.calls.filter((c) => c.task === "chat")).toHaveLength(2);
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    await input.fill("禁止绕过关闭状态");
    await input.press("Enter");
    await expect(input).toHaveValue("禁止绕过关闭状态");
    expect(f.calls.filter((c) => c.task === "chat")).toHaveLength(2);
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
});

test("interview subnavigation retains preparation and practice cards directly launch text or voice rooms", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const f = await fixture(browser, "student");
  try {
    await studentLogin(f.page, f.origin);
    const nav = f.page.getByRole("navigation", { name: "主导航", exact: true });
    await nav.getByRole("link", { name: "仿真语音面试", exact: true }).click();
    await expect(f.page.getByLabel("目标岗位", { exact: true })).toBeVisible();
    await expect(
      f.page.getByRole("button", { name: "进入语音面试房间", exact: true }),
    ).toBeVisible();
    await f.page
      .getByLabel("目标岗位", { exact: true })
      .fill("未提交的语音准备");
    await nav
      .getByRole("link", { name: "文字输入法面试", exact: true })
      .click();
    await expect(f.page.getByLabel("目标岗位", { exact: true })).toHaveValue(
      "",
    );
    await expect(
      f.page.getByRole("button", { name: "开始文字面试", exact: true }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "题库练习", exact: true }).click();
    const cards = f.page.getByRole("region", { name: "常见面试练习" });
    await expect(cards.getByRole("article")).toHaveCount(3);
    expect(f.calls).toHaveLength(0);
    await expect(cards).not.toContainText("AI");
    const card = cards.getByRole("article").first(),
      title = await card.getByRole("heading").innerText();
    await expect(
      card.getByRole("button", { name: "文字练习", exact: true }),
    ).toBeEnabled();
    await f.page.screenshot({ path: join(f.root, "practice-desktop.png") });
    await card.getByRole("button", { name: "文字练习", exact: true }).click();
    await expect(f.page).toHaveURL(/student\/mock\/text\?id=/);
    await expect(
      f.page.getByRole("heading", {
        name: `请介绍你对${title}工作的理解。`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      f.calls.filter((c) => c.task.includes("INTERVIEW_QUESTION")),
    ).toHaveLength(1);
    expect(f.calls.filter((c) => c.task === "tts")).toHaveLength(0);
    await f.page.getByLabel("面试回答与转写").fill("暂未提交的回答");
    f.page.once("dialog", (d) => void d.dismiss());
    await nav.getByRole("link", { name: "仿真语音面试", exact: true }).click();
    await expect(f.page).toHaveURL(/mock\/text\?id=/);
    await expect(f.page.getByLabel("面试回答与转写")).toHaveValue(
      "暂未提交的回答",
    );
    f.page.once("dialog", (d) => void d.accept());
    await nav.getByRole("link", { name: "题库练习", exact: true }).click();
    await f.page.setViewportSize({ width: 390, height: 844 });
    await f.page.screenshot({ path: join(f.root, "practice-mobile.png") });
    expect(
      await f.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await cards
      .getByRole("article")
      .first()
      .getByRole("button", { name: "语音练习", exact: true })
      .click();
    await expect(f.page).toHaveURL(/student\/mock\/voice\?id=/);
    await expect(
      f.page.getByRole("button", { name: "我已回答完毕", exact: true }),
    ).toBeVisible();
    expect(f.calls.filter((c) => c.task === "tts")).toHaveLength(1);
    await f.page
      .getByRole("button", { name: "暂停 / 打断", exact: true })
      .click();
    await f.page.reload();
    await expect(f.page.getByLabel("面试回答与转写")).toBeVisible();
    expect(f.calls.filter((c) => c.task === "tts")).toHaveLength(1);
    await f.page.getByRole("button", { name: "打开导航", exact: true }).click();
    await f.page
      .getByRole("navigation", { name: "移动导航", exact: true })
      .getByRole("link", { name: "题库练习", exact: true })
      .click();
    await expect(cards).toBeVisible();
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    await expect(
      cards.getByRole("button", { name: "文字练习", exact: true }).first(),
    ).toBeDisabled();
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    f.fail();
    await cards
      .getByRole("article")
      .first()
      .getByRole("button", { name: "文字练习", exact: true })
      .click();
    await expect(f.page.getByRole("status")).toContainText("未完成");
    await expect(cards).toBeVisible();
    expect(f.errors).toEqual([]);
    console.log("Interview QA: " + f.root);
  } finally {
    await f.close();
  }
});

test("revoking consent cancels a pending practice start and prevents navigation or saved session", async ({
  browser,
}) => {
  const f = await fixture(browser, "student");
  try {
    await studentLogin(f.page, f.origin);
    await f.page
      .getByRole("navigation", { name: "主导航", exact: true })
      .getByRole("link", { name: "题库练习", exact: true })
      .click();
    f.hold();
    const start = f.page
      .getByRole("region", { name: "常见面试练习" })
      .getByRole("button", { name: "文字练习", exact: true })
      .first();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(f.page.getByRole("status")).toContainText("正在准备");
    await expect.poll(() => f.calls.length).toBe(1);
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    await expect(f.page.getByRole("status")).toContainText("已停止");
    await expect.poll(f.questionAborted).toBe(true);
    f.releaseQuestion();
    await expect(f.page).toHaveURL(/mock\/practice$/);
    const saved = await (
      await f.context.request.get(f.origin + "/api/workbench/sessions")
    ).json();
    expect(saved.sessions).toEqual([]);
  } finally {
    await f.close();
  }
});

test("voice card startup cannot resume automatically after consent was revoked while the room loaded", async ({
  browser,
}) => {
  const f = await fixture(browser, "student");
  let release: () => void = () => {};
  try {
    await studentLogin(f.page, f.origin);
    await f.page
      .getByRole("navigation", { name: "主导航", exact: true })
      .getByRole("link", { name: "题库练习", exact: true })
      .click();
    const voice = f.page
      .getByRole("region", { name: "常见面试练习" })
      .getByRole("button", { name: "语音练习", exact: true })
      .first();
    await expect(voice).toBeEnabled();
    let waiting = false;
    await f.page.route("**/api/workbench/status", async (route) => {
      waiting = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.continue();
    });
    await voice.click();
    await expect(f.page).toHaveURL(/mock\/voice\?id=/);
    await expect.poll(() => waiting).toBe(true);
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    await f.page.getByRole("switch", { name: "AI默认授权" }).click();
    release();
    await expect(f.page.getByLabel("面试回答与转写")).toBeVisible();
    expect(f.calls.filter((c) => c.task === "tts")).toHaveLength(0);
    await expect(
      f.page.getByRole("button", { name: "我已回答完毕", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
    await f.close();
  }
});
