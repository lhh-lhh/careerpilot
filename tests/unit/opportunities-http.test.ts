import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOnlineApp } from "../../server/app";
import { createSqlDatabase } from "../../server/database";
import { createOpportunities } from "../../server/opportunities";
import { parseNcssList } from "../../server/ncss";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "careerpilot-opportunity-http-")),
    path = join(root, "db.sqlite"),
    app = await createOnlineApp({ databasePath: path, seed: true });
  cleanups.push(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  for (const login of ["admin", "student001", "student002"])
    await app.provision(login, "Opportunity-test-Password!");
  const database = createSqlDatabase(path),
    service = createOpportunities(database);
  await service.stage(
    parseNcssList(
      {
        data: {
          list: Array.from({ length: 12 }, (_, i) => ({
            jobId: `job${i}`,
            jobName: `开发工程师${i}`,
            recName: "公开企业",
            areaCodeName: i % 2 ? "北京市" : "上海市",
            degreeName: "本科及以上",
            major: "计算机类",
            sourcesNameCh: "智联招聘",
          })),
        },
      },
      new Date().toISOString(),
    ),
  );
  const admin = { userId: "user-admin-001", role: "admin" } as const;
  for (const row of (await service.admin(admin)).entries)
    await service.review(admin, {
      id: row.id,
      expectedRevision: row.revision,
      commandId: row.id,
      decision: "publish",
      reason: "核对公开来源",
    });
  await database.close();
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`;
  const read = (path: string) => fetch(origin + path);
  async function login(name: string) {
    const response = await fetch(origin + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: name,
        password: "Opportunity-test-Password!",
      }),
    });
    expect(response.status).toBe(200);
    const session = await response.json(),
      cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    return {
      cookie,
      csrf: session.csrf,
      read: (path: string) =>
        fetch(origin + path, { headers: { Cookie: cookie } }),
      post: (path: string, payload: unknown) =>
        fetch(origin + path, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrf,
          },
          body: JSON.stringify(payload),
        }),
    };
  }
  return { read, login, origin };
}
it("paginates and filters public facts without leaking raw entries, unreferenced companies or contacts", async () => {
  const f = await fixture();
  const response = await f.read(
    "/api/public/opportunities?source=external&pageSize=10",
  );
  expect(response.status).toBe(200);
  const page = await response.json();
  expect(page.total).toBe(12);
  expect(page.items).toHaveLength(10);
  expect(JSON.stringify(page)).not.toMatch(
    /candidate|reviewedAt|contact|credential/,
  );
  const second = await (
    await f.read("/api/public/opportunities?source=external&page=2&pageSize=10")
  ).json();
  expect(second.items).toHaveLength(2);
  expect(
    (
      await (
        await f.read(
          "/api/public/opportunities?source=external&location=" +
            encodeURIComponent("上海市"),
        )
      ).json()
    ).total,
  ).toBe(6);
  expect((await f.read("/api/public/opportunities?pageSize=31")).status).toBe(
    422,
  );
  expect((await f.read("/api/public/opportunities/ncss:job1")).status).toBe(
    200,
  );
  expect((await f.read("/api/public/opportunities/ncss:missing")).status).toBe(
    404,
  );
  const old = await (await f.read("/api/public/jobs")).json();
  const referenced = new Set(
    old.jobs.map((j: { companyId: string }) => j.companyId),
  );
  expect(old.companies.every((c: { id: string }) => referenced.has(c.id))).toBe(
    true,
  );
});
it("forbids pending accounts and missing CSRF but allows anonymous browsing without creating a record", async () => {
  const f = await fixture(),
    student = await f.login("student001");
  await f.read("/api/public/opportunities/ncss:job0");
  expect(await (await student.read("/api/opportunity-records")).json()).toEqual(
    [],
  );
  const response = await fetch(f.origin + "/api/opportunity-records", {
    method: "POST",
    headers: { Cookie: student.cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(403);
  const registered = await fetch(f.origin + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: "pending.person",
      password: "Opportunity-test-Password!",
      displayName: "申请人",
      role: "student",
      studentNo: "2027999123",
      majorId: "major-1",
      cohortYear: 2027,
    }),
  });
  expect(registered.status).toBe(201);
  const pending = await f.login("pending.person");
  for (const path of ["/api/opportunity-records", "/api/admin/opportunities"])
    expect((await pending.read(path)).status).toBe(403);
  expect((await pending.read("/api/public/opportunities")).status).toBe(200);
});
it("self-reported external progress can lead only to a separately evidenced and counselor-reviewed external destination", async () => {
  const f = await fixture(),
    student = await f.login("student001");
  // Historical seed fixtures have existing workflow state; use another fresh service below instead of treating it as new activity.
  const { initializeService } = await import("../../server/bootstrap"),
    root = await mkdtemp(join(tmpdir(), "careerpilot-external-chain-")),
    path = join(root, "service.sqlite");
  const credentials = await initializeService(path),
    app = await createOnlineApp({ databasePath: path });
  cleanups.push(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const database = createSqlDatabase(path),
    service = createOpportunities(database);
  await service.stage(
    parseNcssList(
      {
        data: {
          list: [
            {
              jobId: "external1",
              jobName: "技术工程师",
              recName: "外部用人单位",
            },
          ],
        },
      },
      new Date().toISOString(),
    ),
  );
  const row = (await service.admin({ userId: "user-admin-001", role: "admin" }))
    .entries[0]!;
  await service.review(
    { userId: "user-admin-001", role: "admin" },
    {
      id: row.id,
      expectedRevision: row.revision,
      commandId: "publish",
      decision: "publish",
      reason: "隔离来源核对",
    },
  );
  await database.close();
  await app.listen(0);
  const address = app.server.address();
  if (!address || typeof address === "string") throw Error("port");
  const origin = `http://127.0.0.1:${address.port}`;
  async function login(name: string) {
    const response = await fetch(origin + "/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: name,
          password: credentials.find((r) => r.login === name)!.password,
        }),
      }),
      data = await response.json(),
      cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    return {
      read: (path: string) =>
        fetch(origin + path, { headers: { Cookie: cookie } }),
      post: (path: string, body: unknown) =>
        fetch(origin + path, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "X-CSRF-Token": data.csrf,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
    };
  }
  const a = await login("student.chen"),
    teacher = await login("teacher.lin"),
    company = await login("hr.yuanxing");
  expect(
    (
      await a.post("/api/opportunity-records", {
        id: "ncss:external1",
        expectedRevision: 0,
        commandId: "offer-record",
        saved: true,
        status: "offer",
        note: "仅本人记录",
        activityDate: "2026-11-14",
      })
    ).status,
  ).toBe(200);
  const state = await (await a.read("/api/read/readScopedSnapshot")).json();
  expect(state.applications).toHaveLength(0);
  expect(state.agreements).toHaveLength(0);
  expect(state.destinations).toHaveLength(0);
  expect(
    (await (await company.read("/api/read/readCompanyWorkspace")).json())
      .applications,
  ).toHaveLength(0);
  const proof = await (
    await a.post("/api/attachments", {
      fileName: "站外就业证明.pdf",
      mime: "application/pdf",
      base64: Buffer.from("%PDF-isolated-external-test").toString("base64"),
    })
  ).json();
  const command = (
    who: typeof a,
    type: string,
    rev: number,
    payload: unknown,
  ) =>
    who.post("/api/commands", {
      type,
      entityId: "external-destination",
      expectedRevision: rev,
      commandId: crypto.randomUUID(),
      payload,
    });
  expect(
    (
      await command(a, "SAVE_DESTINATION", 0, {
        studentId: state.students[0].id,
        type: "employment",
        source: "external",
        applicationId: null,
        agreementId: null,
        organizationName: "外部用人单位",
        industryId: "industry-1",
        attachmentIds: [proof.id],
      })
    ).status,
  ).toBe(200);
  expect(
    (await command(a, "DESTINATION_ACTION", 1, { action: "SUBMIT" })).status,
  ).toBe(200);
  expect(
    (await command(teacher, "DESTINATION_ACTION", 2, { action: "APPROVE" }))
      .status,
  ).toBe(200);
  expect(
    (await (await a.read("/api/read/readScopedSnapshot")).json())
      .destinations[0],
  ).toMatchObject({
    source: "external",
    status: "approved",
    applicationId: null,
  });
  expect(await (await student.read("/api/opportunity-records")).json()).toEqual(
    [],
  );
});
it("keeps external records private and distinct from actual applications while enforcing admin and CSRF boundaries", async () => {
  const f = await fixture(),
    a = await f.login("student001"),
    b = await f.login("student002"),
    admin = await f.login("admin");
  const before = await (await a.read("/api/read/readScopedSnapshot")).json();
  const payload = {
    id: "ncss:job0",
    expectedRevision: 0,
    commandId: "save-record",
    saved: true,
    status: "following",
    note: "自己的计划",
    activityDate: null,
  };
  expect((await a.post("/api/opportunity-records", payload)).status).toBe(200);
  expect((await (await b.read("/api/opportunity-records")).json()).length).toBe(
    0,
  );
  expect(
    (await (await a.read("/api/read/readScopedSnapshot")).json()).applications
      .length,
  ).toBe(before.applications.length);
  expect((await a.post("/api/admin/opportunities/sync", {})).status).toBe(403);
  expect((await a.read("/api/admin/opportunities")).status).toBe(403);
  expect((await admin.read("/api/opportunity-records")).status).toBe(403);
  const entries = await (await admin.read("/api/admin/opportunities")).json(),
    row = entries.entries.find((r: { id: string }) => r.id === "ncss:job0");
  expect(
    (
      await admin.post("/api/admin/opportunities/review", {
        id: row.id,
        expectedRevision: row.revision,
        commandId: "withdraw",
        decision: "withdraw",
        reason: "待重新核对",
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await a.read("/api/opportunity-records")).json())[0].opportunity
      .availability,
  ).toBe("withdrawn");
  expect(
    (await (await f.read("/api/public/opportunities?source=external")).json())
      .total,
  ).toBe(11);
});
