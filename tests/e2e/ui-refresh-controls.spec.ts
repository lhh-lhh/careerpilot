import { expect, test } from '@playwright/test';

test('UI final editable native fields show hover and focus without losing drafts', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await page.goto('/#/student/resume');
  for (const field of [page.getByLabel('联系邮箱', { exact: true }), page.getByLabel('项目描述 1', { exact: true })]) {
    const before = await field.evaluate(el => getComputedStyle(el).borderColor);
    await field.hover();
    await expect.poll(() => field.evaluate(el => getComputedStyle(el).borderColor)).not.toBe(before);
    await field.focus();
    await expect(field).toHaveCSS('outline-style', 'solid');
  }
  const email = page.getByLabel('联系邮箱', { exact: true });
  await email.fill('ui-final@example.com');
  await page.getByRole('button', { name: '切换到深色主题', exact: true }).click();
  await expect(email).toHaveValue('ui-final@example.com');
});

test('UI final editor, interview and service native controls share visible hover and keyboard focus', async ({ page }) => {
  await page.goto('/#/login'); await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  for (const [route, selector] of [['/student/resume/optimize', '.draft-field textarea'], ['/student/mock/text', '.setup input'], ['/student/service', '#ticket-body'], ['/student/service', '#ticket-query'], ['/student/service', '#ticket-state']]) {
    await page.goto('/#' + route);
    const control = page.locator(selector!).first();
    await control.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await control.blur();
    const before = await control.evaluate(el => getComputedStyle(el).borderColor);
    await control.hover(); await expect.poll(() => control.evaluate(el => getComputedStyle(el).borderColor)).not.toBe(before);
    await control.focus(); await expect(control).toHaveCSS('outline-style', 'solid');
  }
});

test('UI final mobile shell icon and authorization controls provide 44px touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  for (const control of [page.getByRole('button', { name: '切换到深色主题', exact: true }), page.getByRole('switch', { name: 'AI默认授权', exact: true })]) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('UI final route-load failure remains above floating UI with reachable short-screen actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await page.route('**/assets/ResumeView-*.js', route => route.abort('failed'));
  await page.getByRole('link', { name: '继续完善简历', exact: true }).click();
  const alert = page.locator('.route-load-error');
  await expect(alert).toBeVisible();
  const dismiss = alert.getByRole('button', { name: '暂不刷新', exact: true });
  expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(dismiss).toBeInViewport();
  await dismiss.click();
  await expect(alert).toBeHidden();
  await expect(page.getByRole('heading', { name: '让下一步，更有方向。', exact: true })).toBeVisible();
});

test('UI final document preview has its own opaque surface without recoloring the exported sheet', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await page.goto('/#/student/resume/preview');
  const paper = page.getByRole('region', { name: '精致简历卡片', exact: true });
  expect(await paper.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(paper.locator('.resume-sheet').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('UI final destination history has a touch-sized expandable summary', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  await page.goto('/#/student/destination');
  const summary = page.locator('.destination-history > summary');
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.click();
  await expect(page.getByRole('list', { name: '历次去向办理', exact: true })).toBeVisible();
});

test('UI final danger actions have hover feedback', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/#/design-system');
  const danger = page.locator('.button-danger').first();
  const normal = await danger.evaluate(el => getComputedStyle(el).backgroundColor);
  await danger.hover();
  await expect.poll(() => danger.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(normal);
});

test('UI final long dynamic tags stay inside their card', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/#/design-system');
  const tag = page.locator('.tag').first();
  await tag.evaluate(el => { el.append('用于验收的超长动态状态与来源说明'.repeat(5)); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(tag).toHaveCSS('white-space', 'normal');
});

// A missing error outline, tiny close target or short-window clipping breaks these checks.
test('UI final controls retain values and distinguish hover, focus, error, disabled and loading', async ({ page }) => {
  await page.goto('/#/design-system');
  const input = page.getByRole('textbox', { name: '经历标题', exact: true });
  await input.fill('全站验收草稿');
  const initial = await input.evaluate(el => getComputedStyle(el).borderColor);
  await input.hover();
  await expect.poll(() => input.evaluate(el => getComputedStyle(el).borderColor)).not.toBe(initial);
  await input.focus();
  await expect(input).toHaveCSS('outline-style', 'solid');
  const invalid = page.getByRole('textbox', { name: '项目名称', exact: false });
  await expect(invalid).toHaveCSS('border-width', '2px');
  await expect(page.getByRole('textbox', { name: '禁用状态', exact: true })).toBeDisabled();
  const loading = page.getByRole('button', { name: '处理中', exact: true });
  await expect(loading).toBeDisabled();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('combobox', { name: '意向城市', exact: true }).selectOption('hangzhou');
  await page.getByRole('button', { name: '次级操作', exact: true }).click();
  const close = page.getByRole('button', { name: '关闭提示', exact: true });
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(input).toHaveValue('全站验收草稿');
  await page.getByRole('button', { name: '切换到深色主题', exact: true }).click();
  await expect(input).toHaveValue('全站验收草稿');
  await expect(page.getByRole('combobox', { name: '意向城市', exact: true })).toHaveValue('hangzhou');
});

test('UI final assistant and pet menus have usable short-screen touch targets without resetting position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: '以学生身份进入', exact: true }).click();
  const settings = page.getByRole('button', { name: '宠物动作与设置', exact: true });
  expect((await settings.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await settings.click();
  const menu = page.getByRole('region', { name: '宠物动作与设置', exact: true });
  await menu.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(menu.getByRole('button', { name: '关闭宠物设置', exact: true })).toBeInViewport();
  await menu.getByRole('button', { name: '关闭宠物设置', exact: true }).click();
  await page.getByRole('button', { name: 'AI Chatbot · 长按拖动', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: '全局AI助手', exact: true });
  await assistant.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(assistant.getByRole('button', { name: '收起AI助手', exact: true })).toBeInViewport();
});

test('UI final long windows retain a visible close and reachable actions on a short touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/#/login');
  await page.getByRole('radio', { name: '企业', exact: true }).check();
  await page.getByRole('button', { name: '以企业身份进入', exact: true }).click();
  await page.goto('/#/company/jobs');
  await page.getByRole('button', { name: '发布新岗位', exact: true }).click();
  const window = page.getByRole('dialog', { name: '发布新岗位', exact: true });
  await window.locator('.overlay-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await window.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const close = window.getByRole('button', { name: '关闭', exact: true });
  const action = window.getByRole('button', { name: '保存并发布', exact: true });
  expect(await action.evaluate(el => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  const box = await close.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(480);
  await expect(window.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
  await close.click();
  await expect(window).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('UI final design confirmation uses service family and reduced motion/print/forced colors stay readable', async ({ page }) => {
  await page.goto('/#/design-system');
  await page.getByRole('button', { name: '打开弹窗演示', exact: true }).click();
  const window = page.getByRole('dialog', { name: '决定始终在你手中', exact: true });
  expect(await window.evaluate(el => getComputedStyle(el).getPropertyValue('--scene-a').trim())).toBe('#d2e8f2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const durations = await window.evaluate(el => [getComputedStyle(el).animationDuration, getComputedStyle(el).transitionDuration]);
  for (const duration of durations) expect(parseFloat(duration)).toBeLessThanOrEqual(.001);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(window.locator('header')).toHaveCSS('background-image', 'none');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ forcedColors: 'none', media: 'print' });
  await expect(page.locator('.ui-scene')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await page.locator('.ui-scene').evaluate(el => getComputedStyle(el, '::before').display)).toBe('none');
});

test('UI final toast remains readable and unobscured while a short modal is open', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 }); await page.goto('/#/design-system');
  await page.getByRole('button', { name: '次级操作', exact: true }).click();
  await page.getByRole('button', { name: '打开弹窗演示', exact: true }).click();
  const toast = page.locator('.toast'); await expect(toast).toBeVisible();
  expect(await toast.evaluate(el => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await toast.getByRole('button', { name: '关闭提示', exact: true }).click();
  await expect(toast).toBeHidden();
  await expect(page.getByRole('dialog', { name: '决定始终在你手中', exact: true })).toBeVisible();
});
