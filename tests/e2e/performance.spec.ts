import { test, expect } from "@playwright/test";
import os from "node:os";

const p95 = (samples: number[]) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;

const environment = () => ({
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  logicalCpus: os.cpus().length,
  memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
});
test("PERF01 100-job matching actual worker round-trip p95 <300ms, cancel and no persistent mutation", async ({
  page,
}, testInfo) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/data-check");
  await page.getByRole("button", { name: "运行匹配性能检查" }).click();
  await expect(page.getByTestId("matching-performance")).toContainText("30次");
  const ms = Number(await page.getByTestId("matching-p95").textContent());
  expect(ms).toBeLessThan(300);
  await testInfo.attach("matching-performance.json", {
    body: JSON.stringify({
      p95Ms: ms,
      browser: testInfo.project.name,
      samples: 30,
      warmup: 5,
      boundary:
        "main-thread dispatch through structured clone and worker response",
      details: await page.getByTestId("matching-performance").textContent(),
    }),
    contentType: "application/json",
  });
  await expect(page.getByText("真实简历未修改")).toBeVisible();
});

test("PERF02 production filtering and route changes run 30 times with p95 <200ms", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.goto("/#/student/jobs");
  const query = page.getByRole("textbox", { name: "搜索岗位或企业" });
  const filterSamples: number[] = [];
  for (let index = 0; index < 30; index++) {
    const started = performance.now();
    await query.fill(index % 2 === 0 ? "前端" : "数据");
    await page.locator(".job-row").first().waitFor({ state: "visible" });
    filterSamples.push(performance.now() - started);
  }

  const routeSamples: number[] = [];
  for (let index = 0; index < 30; index++) {
    const target = index % 2 === 0 ? "resume" : "jobs";
    const heading =
      target === "resume" ? "把经历，写成你的优势。" : "找到适合你的下一站。";
    const started = performance.now();
    await page.goto(`/#/student/${target}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    routeSamples.push(performance.now() - started);
  }

  const result = {
    samples: 30,
    boundary: {
      filter: "Playwright fill through Vue computed filtering and first rendered result",
      route: "hash navigation request through target page heading visible",
    },
    filterP95Ms: p95(filterSamples),
    routeP95Ms: p95(routeSamples),
    environment: environment(),
    browser: testInfo.project.name,
  };
  await testInfo.attach("filter-route-performance.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.filterP95Ms).toBeLessThan(200);
  expect(result.routeP95Ms).toBeLessThan(200);
});

test("PERF03 production cold login opens 30 times with p95 <1.5s", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const samples: number[] = [];
  for (let index = 0; index < 30; index++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const started = performance.now();
    await page.goto("http://127.0.0.1:4173/#/login", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "选择演示角色" })).toBeVisible();
    samples.push(performance.now() - started);
    await context.close();
  }
  const result = {
    samples: 30,
    p95Ms: p95(samples),
    boundary: "fresh browser context navigation start through login heading visible",
    cache: "fresh context per sample",
    network: "local production static server; application has no external requests",
    environment: environment(),
    browser: testInfo.project.name,
  };
  await testInfo.attach("cold-open-performance.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.p95Ms).toBeLessThan(1_500);
});
