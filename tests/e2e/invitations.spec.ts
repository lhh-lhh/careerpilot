import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOnlineApp } from "../../server/app";

test("student requests a new time, employer reschedules and student confirms in independent sessions", async ({ browser }) => {
  test.setTimeout(60000);
  const dir = await mkdtemp(join(tmpdir(), "careerpilot-invitations-"));
  const app = await createOnlineApp({ databasePath: join(dir, "test.sqlite"), seed: true, staticRoot: resolve("dist") });
  const studentActor = { userId: "user-student-040", role: "student" as const }, companyActor = { userId: "user-company-001", role: "company" as const };
  const clock = { now: () => new Date().toISOString() };
  const studentContext = await browser.newContext(), companyContext = await browser.newContext();
  try {
    await app.provision("student040", "Browser-test-Password-01!");
    await app.provision("company1", "Browser-test-Password-01!");
    await app.repository.execute({ type: "APPLY", commandId: crypto.randomUUID(), entityId: "browser-invitation", expectedRevision: 0, payload: { jobId: "job-001", resumeConsent: true } }, studentActor, clock);
    await app.repository.execute({ type: "APPLICATION_ACTION", commandId: crypto.randomUUID(), entityId: "browser-invitation", expectedRevision: 1, payload: { action: "SCHEDULE_INTERVIEW", scheduledAt: "2026-12-10T10:00:00Z", location: "第一会议室" } }, companyActor, clock);
    await app.listen(0);
    const address = app.server.address(); if (!address || typeof address === "string") throw Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    const student = await studentContext.newPage(), company = await companyContext.newPage();
    for (const [page, login] of [[student, "student040"], [company, "company1"]] as const) {
      await page.goto(`${base}/#/login`);
      await page.getByRole("textbox", { name: "账号", exact: true }).fill(login);
      await page.getByLabel("密码", { exact: true }).fill("Browser-test-Password-01!");
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
    }
    await student.goto(`${base}/#/student/applications?application=browser-invitation`);
    await company.goto(`${base}/#/company/candidates?application=browser-invitation`);
    await student.getByRole("button", { name: "申请改期", exact: true }).click();
    await student.getByRole("dialog", { name: "申请改期", exact: true }).getByLabel("原因", { exact: true }).fill("与课程考试冲突，请重新安排时间。");
    await student.getByRole("dialog", { name: "申请改期", exact: true }).getByRole("button", { name: "提交响应", exact: true }).click();
    await expect(student.getByRole("status")).toContainText("响应已保存");
    await expect(company.getByText("学生申请改期", { exact: true })).toBeVisible();
    await company.getByRole("button", { name: "调整面试", exact: true }).click();
    const schedule = company.getByRole("dialog", { name: "调整候选人面试" });
    await schedule.getByLabel("面试时间").fill("2026-12-11T18:00");
    await schedule.getByLabel("面试地点").fill("第二会议室");
    await schedule.getByRole("button", { name: "确认安排", exact: true }).click();
    await expect(student.getByText("第二会议室", { exact: true })).toBeVisible();
    await student.getByRole("button", { name: "确认参加", exact: true }).click();
    await student.getByRole("dialog", { name: "确认参加", exact: true }).getByRole("button", { name: "提交响应", exact: true }).click();
    await expect(company.getByText("学生已确认", { exact: true })).toBeVisible();
    await student.reload();
    await expect(student.getByText("已确认参加", { exact: true })).toBeVisible();
    await student.setViewportSize({ width: 375, height: 812 });
    await expect(student.getByRole("button", { name: "拒绝邀约", exact: true })).toBeVisible();
    const overflow = await student.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await company.getByRole('button', { name: '取消邀约', exact: true }).click();
    const cancellation = company.getByRole('dialog', { name: '取消本次面试' });
    await cancellation.getByLabel('取消原因', { exact: true }).fill('招聘安排调整，后续时间另行通知。');
    await cancellation.getByRole('button', { name: '确认取消', exact: true }).click();
    await expect(student.getByText('招聘安排调整，后续时间另行通知。', { exact: true })).toBeVisible();
    await expect(student.getByRole('button', { name: '确认参加', exact: true })).toHaveCount(0);
    await company.reload(); await expect(company.getByRole('button', { name: '安排面试', exact: true })).toBeVisible();
  } finally {
    await studentContext.close(); await companyContext.close(); await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
