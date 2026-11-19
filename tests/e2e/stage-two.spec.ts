import { test, expect } from "@playwright/test";
test('a failed lazy route preserves the current screen and offers an explicit refresh without silently losing input', async ({ page }) => {
  await page.goto('/#/login'); await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '让下一步，更有方向。', exact: true })).toBeVisible();
  await page.route('**/assets/ApplicationsView-*.js', route => route.abort());
  await page.getByRole('link', { name: '我的投递', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('页面资源加载失败');
  await expect(page.getByRole('button', { name: '刷新页面', exact: true })).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('让下一步，更有方向。');
});
test("public portal is the common entry and its primary actions reach useful routes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让下一步，\s*更有方向。/ })).toBeVisible();
  await page.getByRole("link", { name: "探索岗位", exact: true }).click();
  await expect(page.getByRole("heading", { name: "发现新的可能", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "登录工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "选择演示角色" })).toBeVisible();
});

test("portal scene keeps a usable local fallback when the preferred image fails", async ({ page }) => {
  let preferredRequested = false;
  await page.route('**/media/campus-ai.jpg', route => { preferredRequested = true; return route.abort(); });
  await page.goto('/');
  await expect.poll(() => preferredRequested).toBe(true);
  const scene = page.getByRole('img', { name: '校园建筑与绿地，职业旅程从这里出发' });
  await expect(scene).toHaveAttribute('src', '/media/campus.jpg');
  expect(await scene.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});
test("portal scene stops retrying and keeps its layout if both local images fail", async ({ page }) => {
  let requests = 0;
  await page.route('**/media/campus*.jpg', route => { requests++; return route.abort(); });
  await page.goto('/');
  const placeholder = page.getByRole('img', { name: '校园场景暂不可用' });
  await expect(placeholder).toBeVisible();
  expect(requests).toBe(2);
  const bounds = await placeholder.boundingBox();
  expect(bounds!.height).toBeGreaterThan(100);
  await page.getByRole('link', { name: '探索岗位', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发现新的可能', exact: true })).toBeVisible();
});
test("small match scores fit their rings and company subpages use compact headers", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await expect(page.locator(".recommendation-row").first()).toBeVisible();
  await page.getByRole("link", { name: "跳到主要内容", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const size = await page.locator(".recommendation-row .score-ring strong").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeLessThanOrEqual(22);
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "企业", exact: true }).click();
  await page.getByRole("button", { name: "以企业身份进入" }).click();
  await page.getByRole("link", { name: "候选人流程", exact: true }).first().click();
  await expect(page.locator('.workbench-header[data-layout="candidates"]')).toBeVisible();
  await expect(page.getByRole("combobox", { name: "候选人排序" })).toBeVisible();
  const headingColor = await page.locator('.workbench-header[data-layout="candidates"] h1').evaluate(el => getComputedStyle(el).color);
  const contentColor = await page.locator('main').evaluate(el => getComputedStyle(el).color);
  expect(headingColor).toBe(contentColor);
  await page.getByRole('combobox', { name: '候选人阶段' }).selectOption({ label: '面试阶段' });
  await expect(page.locator('.candidate-detail h2')).toHaveText('林知夏·5');
  await page.getByRole('textbox', { name: '搜索候选人' }).fill('无此候选人');
  await expect(page.locator('.candidate-detail h2')).toHaveCount(0);
});

test("student sees scheduled interview details with location and explicit timezone", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await page.getByRole("link", { name: "我的投递", exact: true }).click();
  const interviews = page.getByRole("region", { name: "面试安排" });
  await expect(interviews).toContainText("教学在线会议室");
  await expect(interviews).toContainText("北京时间");
});

test("portal service returns a demo student to the requested workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "01 梳理经历" }).click();
  await page.getByRole("button", { name: "以学生身份进入" }).click();
  await expect(page).toHaveURL(/student\/resume/);
});

test("counselor can narrow the roster by destination review state", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByRole("radio", { name: "辅导员", exact: true }).click();
  await page.getByRole("button", { name: "以辅导员身份进入" }).click();
  await page.getByRole("combobox", { name: "去向审核状态" }).selectOption("approved");
  const rows = page.locator(".student-roster > button");
  await expect(rows).toHaveCount(10);
  for (const row of await rows.all()) await expect(row).toContainText("已通过");
  await page.getByRole("combobox", { name: "去向审核状态" }).selectOption("submitted");
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("没有符合条件的学生。", { exact: true })).toBeVisible();
  await expect(page.locator(".student-review")).toHaveCount(0);
});

test("mobile portal title keeps the second phrase together", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const lines = await page.locator('h1').evaluate(el => {
    const phrase = el.lastChild!;
    const range = document.createRange(); range.selectNodeContents(phrase);
    return range.getClientRects().length;
  });
  expect(lines).toBe(1);
});

test("tablet roster stacks above student details without squeezing the review", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/#/login');
  await page.getByRole('radio', { name: '辅导员', exact: true }).click();
  await page.getByRole('button', { name: '以辅导员身份进入' }).click();
  await expect(page.locator('.student-review')).toBeVisible();
  const roster = await page.locator('.student-roster').boundingBox();
  const detail = await page.locator('.student-review').boundingBox();
  expect(detail!.y).toBeGreaterThanOrEqual(roster!.y + roster!.height - 1);
});

test("student agreements carry the same company identity as recruitment pages", async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入' }).click();
  await page.getByRole('link', { name: '协议与去向', exact: true }).click();
  const agreement = page.locator('.agreement-list article').first();
  await expect(agreement).toBeVisible();
  await expect(agreement.locator('.entity-mark')).toHaveAttribute('title', '青屿数字（虚构）');
});
