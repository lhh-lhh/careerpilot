import { test, expect } from "@playwright/test";

test("V01 P18 exposes measured contrast and both brand lockups", async ({
  page,
}) => {
  await page.goto("/#/design-system");
  await expect(
    page.getByRole("table", { name: "主题文字对比度实测" }),
  ).toBeVisible();
  await expect(page.locator("[data-contrast-ratio]")).toHaveCount(9);
  await expect(page.getByText("竖版组合 · 登录与封面")).toBeVisible();
  await expect(
    page.getByText("不拉伸徽记，不给主名加渐变，不放大副标。"),
  ).toBeVisible();
  for (const value of await page
    .locator("[data-contrast-ratio]")
    .allTextContents()) {
    expect(parseFloat(value)).toBeGreaterThanOrEqual(4.5);
  }
});

test("V03 drawer traps focus, Escape closes and focus returns to opener", async ({
  page,
}) => {
  await page.goto("/#/design-system");
  const trigger = page.getByRole("button", { name: "打开抽屉演示" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "一束清晰的指引" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "关闭" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "完成演示" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "关闭" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("V03 modal maintains a focus boundary and reports form errors accessibly", async ({
  page,
}) => {
  await page.goto("/#/design-system");
  await page.getByRole("button", { name: "打开弹窗演示" }).click();
  await expect(
    page.getByRole("dialog", { name: "决定始终在你手中" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "打开弹窗演示" }),
  ).toBeFocused();
  const invalid = page.getByLabel("项目名称");
  await expect(invalid).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("请填写项目名称，便于准确展示你的经历。"),
  ).toBeVisible();
});

test("V01 themes preserve readable secondary text and focus affordance", async ({
  page,
}) => {
  await page.goto("/#/design-system");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "切换到深色主题" }).click();
    await expect(page.locator("[data-contrast-ratio]")).toHaveCount(9);
    for (const value of await page.locator("[data-contrast-ratio]").allTextContents()) {
      expect(parseFloat(value)).toBeGreaterThanOrEqual(4.5);
    }
    const pair = await page
      .locator('[data-contrast="secondary"]')
      .evaluate((element) => {
        const css = getComputedStyle(element);
        return {
          fg: css.color,
          bg: getComputedStyle(document.documentElement)
            .getPropertyValue("--bg-base")
            .trim(),
        };
      });
    const channel = (v: number) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const luminance = (color: string) => {
      const rgb = color.startsWith("#")
        ? color
            .slice(1)
            .match(/../g)!
            .map((x) => parseInt(x, 16))
        : color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number);
      return rgb
        .map((x) => channel(x / 255))
        .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i]!, 0);
    };
    const [a, b] = [luminance(pair.fg), luminance(pair.bg)].sort(
      (a, b) => b - a,
    );
    expect((a! + 0.05) / (b! + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const width of [375, 768, 1280, 1920]) {
  test(`V02 login and design system have no page overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    for (const route of ["login", "design-system"]) {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/visual/${route}-${width}.png`,
        fullPage: true,
      });
    }
  });
}

test("V04 reduced motion and print remove motion and non-report chrome", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/design-system");
  const animation = await page
    .locator(".skeleton")
    .first()
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(animation)).toBeLessThanOrEqual(0.001);
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { name: "清晰，是最好的指引。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开抽屉演示" }),
  ).not.toBeVisible();
});
