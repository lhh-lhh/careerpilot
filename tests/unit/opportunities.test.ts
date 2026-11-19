import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqlDatabase } from "../../server/database";
import { parseNcssList, fetchNcssList } from "../../server/ncss";
import { createOpportunities } from "../../server/opportunities";
import { backupDatabase, restoreDatabase } from "../../server/backup";
import type { Actor } from "../../src/types/identity";
const now = "2026-11-14T09:30:00.000Z";
const admin = { userId: "admin", role: "admin" } as Actor,
  student = { userId: "a", role: "student" } as Actor,
  other = { userId: "b", role: "student" } as Actor;
const raw = (extra: Record<string, unknown> = {}) => ({
  jobId: "abc123",
  jobName: "开发工程师",
  recName: "远行技术",
  areaCodeName: "上海市",
  degreeName: "本科及以上",
  major: "计算机类",
  publishDate: 1794614400000,
  updateDate: 1794618000000,
  sourcesNameCh: "智联招聘",
  lowMonthPay: 0,
  highMonthPay: 0,
  ...extra,
});
const pack = (rows: unknown[]) => ({
  flag: true,
  data: { list: rows, pagenation: { totalCount: rows.length } },
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture(clock = () => now) {
  const root = await mkdtemp(join(tmpdir(), "careerpilot-opportunities-")),
    database = createSqlDatabase(join(root, "db.sqlite"));
  cleanup.push(async () => {
    await database.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    database,
    service: createOpportunities(database, { now: clock }),
  };
}
it("keeps only public facts, distinct dates and underlying source without inventing salary or deadline", () => {
  const result = parseNcssList(
    pack([
      raw({
        contact: "private",
        email: "private@example.com",
        html: "<script>x</script>",
      }),
    ]),
    now,
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    id: "ncss:abc123",
    title: "开发工程师",
    employer: "远行技术",
    sourceName: "国家大学生就业服务平台",
    underlyingSource: "智联招聘",
    salaryText: "面议",
    deadline: null,
    observedAt: now,
  });
  expect(result[0]!.publishedAt).not.toBe(result[0]!.sourceUpdatedAt);
  expect(JSON.stringify(result)).not.toMatch(/private|<script>|contact|email/);
  expect(
    parseNcssList(pack([raw({ lowMonthPay: 8, highMonthPay: 12 })]), now)[0]
      ?.salaryText,
  ).toBe("原站查看");
});
it("rejects oversized batches, malformed envelopes, unsafe identifiers and unrenderable fields", () => {
  expect(() =>
    parseNcssList(
      pack(Array.from({ length: 31 }, (_, i) => raw({ jobId: `x${i}` }))),
      now,
    ),
  ).toThrow("PAYLOAD_TOO_LARGE");
  for (const value of [
    {},
    { data: { list: "wrong" } },
    pack([raw({ jobId: "../../evil" })]),
    pack([raw({ jobName: "<script>alert(1)</script>" })]),
    pack([raw({ jobName: "" })]),
  ])
    expect(() => parseNcssList(value, now)).toThrow();
  expect(parseNcssList(pack([raw(), raw()]), now)).toHaveLength(1);
});
it("does not turn an unknown zero headcount into zero vacancies", () => {
  expect(
    parseNcssList(pack([raw({ headCount: 0 })]), now)[0]?.headCount,
  ).toBeNull();
});
it("does not label missing salary fields as negotiable", () => {
  for (const value of [null, "", undefined]) {
    expect(
      parseNcssList(
        pack([raw({ lowMonthPay: value, highMonthPay: value })]),
        now,
      )[0]?.salaryText,
    ).toBe("原站查看");
  }
});
it("migrates the former three link entries to review only once and never republishes or restages them on restart", async () => {
  const { service, database } = await fixture();
  expect(await service.migrateLegacy()).toMatchObject({ count: 3 });
  expect(await service.publicExternal()).toHaveLength(0);
  expect((await service.admin(admin)).entries).toHaveLength(3);
  const restarted = createOpportunities(database);
  expect(await restarted.migrateLegacy()).toMatchObject({ count: 0 });
  expect((await restarted.admin(admin)).entries).toHaveLength(3);
});
it("validates record dates, requires explicit progress dates and preserves drafts on stale writes", async () => {
  const { service } = await fixture();
  await service.stage(parseNcssList(pack([raw()]), now));
  const row = (await service.admin(admin)).entries[0]!;
  await service.review(admin, {
    id: row.id,
    expectedRevision: 1,
    commandId: "publish",
    decision: "publish",
    reason: "来源核对",
  });
  const p = {
    id: row.id,
    expectedRevision: 0,
    commandId: "save",
    saved: true,
    status: "applied",
    note: "计划",
    activityDate: null,
  };
  for (const activityDate of [null, "2026-02-31", "2026-99-99", "not-date"])
    await expect(
      service.saveRecord(student, { ...p, activityDate }),
    ).rejects.toThrow("VALIDATION_ERROR");
  await service.saveRecord(student, { ...p, activityDate: "2026-11-14" });
  await expect(
    service.saveRecord(student, {
      ...p,
      commandId: "stale",
      activityDate: "2026-11-14",
    }),
  ).rejects.toThrow("REVISION_CONFLICT");
  expect((await service.records(student))[0]?.note).toBe("计划");
});
it("allows only explicitly verified salary and work-type enrichment at review, never arbitrary content URLs", async () => {
  const { service } = await fixture();
  await service.stage(parseNcssList(pack([raw()]), now));
  await expect(
    service.review(admin, {
      id: "ncss:abc123",
      expectedRevision: 1,
      commandId: "unsafe",
      decision: "publish",
      reason: "核对",
      verifiedFields: { url: "https://evil.test" },
    }),
  ).rejects.toThrow("VALIDATION_ERROR");
  await service.review(admin, {
    id: "ncss:abc123",
    expectedRevision: 1,
    commandId: "verified",
    decision: "publish",
    reason: "详情抽样核对8k-10k和全职",
    verifiedFields: { salaryText: "8–10K / 月", recruitmentType: "全职" },
    qualificationNote: "2027届及2025/2026届未就业毕业生",
  });
  expect((await service.publicExternal())[0]).toMatchObject({
    salaryText: "8–10K / 月",
    recruitmentType: "全职",
    qualificationNote: "2027届及2025/2026届未就业毕业生",
  });
});
it("never republishes withdrawn content when a new candidate is rejected", async () => {
  const { service } = await fixture();
  await service.stage(parseNcssList(pack([raw()]), now));
  await service.review(admin, {
    id: "ncss:abc123",
    expectedRevision: 1,
    commandId: "publish",
    decision: "publish",
    reason: "来源核对",
  });
  await service.review(admin, {
    id: "ncss:abc123",
    expectedRevision: 2,
    commandId: "withdraw",
    decision: "withdraw",
    reason: "需重新核对",
  });
  await service.stage(parseNcssList(pack([raw({ jobName: "修改标题" })]), now));
  const row = (await service.admin(admin)).entries[0]!;
  await service.review(admin, {
    id: row.id,
    expectedRevision: row.revision,
    commandId: "reject",
    decision: "reject",
    reason: "内容未通过",
  });
  expect(await service.publicExternal()).toHaveLength(0);
  expect((await service.detail(row.id)).availability).toBe("withdrawn");
});
it("retains the reviewed facts of a rejected new source for administrator follow-up without publishing it", async () => {
  const { service } = await fixture();
  await service.stage(parseNcssList(pack([raw()]), now));
  await service.review(admin, {
    id: "ncss:abc123",
    expectedRevision: 1,
    commandId: "reject-new",
    decision: "reject",
    reason: "资格要求需核对",
  });
  expect(await service.publicExternal()).toHaveLength(0);
  expect((await service.admin(admin)).entries[0]).toMatchObject({
    status: "rejected",
    candidate: { title: "开发工程师", employer: "远行技术" },
  });
});
it("never follows redirects or retries restricted/oversized upstream responses", async () => {
  for (const response of [
    new Response("", { status: 403 }),
    new Response("", { status: 429 }),
    new Response("", {
      status: 302,
      headers: { location: "https://evil.test" },
    }),
    new Response("x".repeat(1048577)),
  ]) {
    let calls = 0;
    await expect(
      fetchNcssList(now, async (url, options) => {
        calls++;
        expect(String(url)).toBe(
          "https://www.ncss.cn/student/jobs/jobslist/ajax/?offset=1&limit=20",
        );
        expect(options?.redirect).toBe("error");
        return response;
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  }
});
it("requires admin review, is idempotent and keeps the published version while new content awaits review", async () => {
  const { service } = await fixture();
  const rows = parseNcssList(pack([raw()]), now);
  await service.stage(rows);
  expect(await service.publicExternal()).toHaveLength(0);
  let row = (await service.admin(admin)).entries[0]!;
  const command = {
    id: row.id,
    expectedRevision: row.revision,
    commandId: "publish-1",
    decision: "publish",
    reason: "核对公开字段及原站入口",
  };
  await expect(service.review(student, command)).rejects.toThrow("FORBIDDEN");
  await service.review(admin, command);
  await service.review(admin, command);
  expect(await service.publicExternal()).toHaveLength(1);
  await expect(
    service.review(admin, { ...command, reason: "changed" }),
  ).rejects.toThrow("COMMAND_COLLISION");
  await service.stage(
    parseNcssList(pack([raw({ jobName: "高级开发工程师" })]), now),
  );
  expect((await service.publicExternal())[0]?.title).toBe("开发工程师");
  await expect(
    service.review(admin, { ...command, commandId: "stale" }),
  ).rejects.toThrow("REVISION_CONFLICT");
  row = (await service.admin(admin)).entries[0]!;
  await service.review(admin, {
    ...command,
    expectedRevision: row.revision,
    commandId: "publish-2",
  });
  expect((await service.publicExternal())[0]?.title).toBe("高级开发工程师");
});
it("hides expired or stale discoveries, preserves personal history, and rejects cross-user writes", async () => {
  let clock = now;
  const { service } = await fixture(() => clock);
  await service.stage(parseNcssList(pack([raw()]), now));
  const entry = (await service.admin(admin)).entries[0]!;
  await service.review(admin, {
    id: entry.id,
    expectedRevision: entry.revision,
    commandId: "review",
    decision: "publish",
    reason: "核对来源",
  });
  await service.saveRecord(student, {
    id: entry.id,
    expectedRevision: 0,
    commandId: "save",
    saved: true,
    status: "following",
    note: "准备材料",
    activityDate: null,
  });
  expect(await service.records(other)).toHaveLength(0);
  await expect(
    service.saveRecord(other, {
      id: entry.id,
      expectedRevision: 1,
      commandId: "hack",
      saved: true,
      status: "applied",
      note: "x",
      activityDate: "2026-11-14",
    }),
  ).rejects.toThrow("REVISION_CONFLICT");
  clock = "2026-11-22T09:30:00.000Z";
  expect((await service.publicExternal())[0]?.freshness).toBe("needsUpdate");
  clock = "2026-12-15T09:30:00.000Z";
  expect(await service.publicExternal()).toHaveLength(0);
  expect(await service.records(student)).toHaveLength(1);
});
it("consumes a persistent 24-hour sync budget even when the network fails and does not erase published data", async () => {
  const { service, database } = await fixture();
  let requests = 0;
  await expect(
    service.sync(admin, async () => {
      requests++;
      throw Error("network");
    }),
  ).rejects.toThrow("UPSTREAM_ERROR");
  const restarted = createOpportunities(database, { now: () => now });
  await expect(
    restarted.sync(admin, async () => {
      requests++;
      return new Response("{}");
    }),
  ).rejects.toThrow("RATE_LIMITED");
  expect(requests).toBe(1);
  await expect(restarted.sync(student)).rejects.toThrow("FORBIDDEN");
  expect(requests).toBe(1);
});
it("backs up and restores staged opportunities, records and budget without resurrecting sessions", async () => {
  const { root, service, database } = await fixture();
  await service.stage(parseNcssList(pack([raw()]), now));
  const row = (await service.admin(admin)).entries[0]!;
  await service.review(admin, {
    id: row.id,
    expectedRevision: row.revision,
    commandId: "review",
    decision: "publish",
    reason: "来源核对",
  });
  await service.saveRecord(student, {
    id: row.id,
    expectedRevision: 0,
    commandId: "save",
    saved: true,
    status: "following",
    note: "个人记录",
    activityDate: null,
  });
  await expect(
    service.sync(admin, async () => {
      throw Error("network");
    }),
  ).rejects.toThrow("UPSTREAM_ERROR");
  database.sql
    .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
    .run("old", "a", "csrf", 9999999999999);
  await backupDatabase(join(root, "db.sqlite"), join(root, "snapshot"));
  const restored = await restoreDatabase(
    join(root, "snapshot"),
    join(root, "restore"),
  );
  const db = createSqlDatabase(restored);
  try {
    const restoredService = createOpportunities(db, { now: () => now });
    expect(await restoredService.records(student)).toHaveLength(1);
    expect(await restoredService.publicExternal()).toHaveLength(1);
    await expect(
      restoredService.sync(admin, async () => {
        throw Error("must not fetch after restore");
      }),
    ).rejects.toThrow("RATE_LIMITED");
    expect(db.sql.prepare("SELECT count(*) AS n FROM sessions").get()?.n).toBe(
      0,
    );
  } finally {
    await db.close();
  }
});
it("keeps failed sync contents and record idempotency across a real database reopen", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "careerpilot-opportunity-restart-"),
  );
  const path = join(root, "db.sqlite");
  let database = createSqlDatabase(path);
  cleanup.push(async () => {
    await database.close();
    await rm(root, { recursive: true, force: true });
  });
  let service = createOpportunities(database, { now: () => now });
  const row = parseNcssList(pack([raw()]), now)[0]!;
  await service.stage([
    row,
    {
      ...row,
      id: "ncss:expired",
      url: "https://www.ncss.cn/student/jobs/expired/detail.html",
      deadline: "2026-11-13T00:00:00.000Z",
    },
  ]);
  for (const e of (await service.admin(admin)).entries)
    await service.review(admin, {
      id: e.id,
      expectedRevision: e.revision,
      commandId: e.id,
      decision: "publish",
      reason: "核对",
    });
  expect(await service.publicExternal()).toHaveLength(1);
  expect((await service.detail("ncss:expired")).availability).toBe("expired");
  const p = {
    id: row.id,
    expectedRevision: 0,
    commandId: "record",
    saved: true,
    status: "following",
    note: "跨重启记录",
    activityDate: null,
  };
  await service.saveRecord(student, p);
  await expect(
    service.sync(admin, async () => new Response("", { status: 429 })),
  ).rejects.toThrow("UPSTREAM_ERROR");
  expect(await service.publicExternal()).toHaveLength(1);
  await database.close();
  database = createSqlDatabase(path);
  service = createOpportunities(database, { now: () => now });
  expect(await service.saveRecord(student, p)).toMatchObject({revision: 1});
  expect((await service.records(student))[0]?.note).toBe("跨重启记录");
  await expect(service.sync(admin)).rejects.toThrow("RATE_LIMITED");
  expect(
    database.sql
      .prepare(
        "SELECT count(*) n FROM opportunity_audit WHERE action='personal-record'",
      )
      .get()?.n,
  ).toBe(1);
});
