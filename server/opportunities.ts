import { createHash } from "node:crypto";
import type { createSqlDatabase } from "./database";
import type { Actor } from "../src/types/identity";
import type {
  ExternalOpportunity,
  Opportunity,
  OpportunityEntry,
  OpportunityRecord,
} from "../src/types/opportunities";
import { recordStatusLabels } from "../src/types/opportunities";
import { fetchNcssList } from "./ncss";
import { officialResources } from "./public-resources";
type Database = ReturnType<typeof createSqlDatabase>;
function fail(code: string): never {
  throw Error(code);
}
const adminOnly = (actor: Actor) => {
  if (actor.role !== "admin") fail("FORBIDDEN");
};
const studentOnly = (actor: Actor) => {
  if (actor.role !== "student") fail("FORBIDDEN");
};
const decode = <T>(row: { data?: unknown } | undefined): T | null =>
  row ? (JSON.parse(String(row.data)) as T) : null;
function string(value: unknown, max: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim()) ||
    [...value].some(
      (c) => c.charCodeAt(0) < 32 && !["\t", "\n", "\r"].includes(c),
    )
  )
    fail("VALIDATION_ERROR");
  return (value as string).trim();
}
export function decorateExternal(
  row: ExternalOpportunity,
  now: string,
  withdrawn = false,
): Opportunity {
  const age = Date.parse(now) - Date.parse(row.observedAt),
    expired = !!row.deadline && row.deadline <= now;
  return {
    ...row,
    kind: "external",
    freshness:
      age > 30 * 864e5 ? "stale" : age > 7 * 864e5 ? "needsUpdate" : "recent",
    availability: withdrawn
      ? "withdrawn"
      : expired
        ? "expired"
        : age > 30 * 864e5
          ? "stale"
          : "available",
  };
}
export function createOpportunities(
  database: Database,
  clock = { now: () => new Date().toISOString() },
) {
  const { sql, db, transaction } = database;
  const entries = (): OpportunityEntry[] =>
    sql
      .prepare("SELECT data FROM external_opportunities ORDER BY id")
      .all()
      .map((r) => JSON.parse(String(r.data)));
  const entry = (id: string) =>
    decode<OpportunityEntry>(
      sql.prepare("SELECT data FROM external_opportunities WHERE id=?").get(id),
    );
  const put = (row: OpportunityEntry) =>
    sql
      .prepare(
        "INSERT INTO external_opportunities VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data",
      )
      .run(row.id, row.revision, JSON.stringify(row));
  const signal = (userId: string) =>
    sql
      .prepare("INSERT INTO changes(user_id,created_at) VALUES(?,?)")
      .run(userId, clock.now());
  function receipt<T>(
    scope: string,
    payload: Record<string, unknown>,
    apply: () => T,
  ): T {
    const commandId = string(payload.commandId, 128),
      hash = createHash("sha256")
        .update(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
            ),
          ),
        )
        .digest("hex");
    const previous = sql
      .prepare(
        "SELECT hash,result FROM opportunity_receipts WHERE scope=? AND command_id=?",
      )
      .get(scope, commandId);
    if (previous) {
      if (previous.hash !== hash) fail("COMMAND_COLLISION");
      return JSON.parse(String(previous.result)) as T;
    }
    const result = apply();
    sql
      .prepare("INSERT INTO opportunity_receipts VALUES(?,?,?,?)")
      .run(scope, commandId, hash, JSON.stringify(result));
    return result;
  }
  async function stage(rows: ExternalOpportunity[]) {
    if (rows.length > 30) fail("PAYLOAD_TOO_LARGE");
    return transaction(async () => {
      let changed = 0;
      for (const row of rows) {
        if (
          !/^ncss:[A-Za-z0-9]{1,80}$/.test(row.id) ||
          row.url !==
            `https://www.ncss.cn/student/jobs/${row.id.slice(5)}/detail.html` ||
          !row.title ||
          !row.employer ||
          !Number.isFinite(Date.parse(row.observedAt))
        )
          fail("VALIDATION_ERROR");
        const old = entry(row.id);
        if (
          JSON.stringify(old?.candidate ?? old?.published) ===
          JSON.stringify(row)
        )
          continue;
        put({
          id: row.id,
          revision: (old?.revision ?? 0) + 1,
          candidate: row,
          published: old?.published ?? null,
          status: old?.status === "withdrawn" ? "withdrawn" : "pending",
          reason: old?.reason ?? "",
          reviewedAt: old?.reviewedAt ?? null,
        });
        changed++;
      }
      return { count: rows.length, changed };
    });
  }
  async function admin(actor: Actor) {
    adminOnly(actor);
    return {
      entries: entries(),
      runs: sql
        .prepare("SELECT * FROM opportunity_sync ORDER BY id DESC LIMIT 10")
        .all(),
      nextSyncAt: (() => {
        const latest = sql
          .prepare("SELECT MAX(started_at) AS at FROM opportunity_sync")
          .get()?.at;
        return latest
          ? new Date(Date.parse(String(latest)) + 864e5).toISOString()
          : null;
      })(),
    };
  }
  async function migrateLegacy() {
    return transaction(async () => {
      const done = sql
        .prepare(
          "SELECT 1 FROM opportunity_receipts WHERE scope='migration' AND command_id='legacy-links-v1'",
        )
        .get();
      if (done) return { count: 0 };
      const rows: ExternalOpportunity[] = officialResources
        .filter((r) => r.kind === "job")
        .map((r) => ({
          id: `ncss:${r.id.slice(5)}`,
          title: r.title,
          employer: r.employer!,
          location: r.location,
          degree: null,
          majors: null,
          recruitmentType: null,
          salaryText: "原站查看",
          headCount: null,
          industry: null,
          companyNature: null,
          companySize: null,
          sourceName: r.source,
          underlyingSource: null,
          url: r.url,
          publishedAt: r.publishedAt,
          sourceUpdatedAt: null,
          observedAt: r.observedAt,
          deadline: r.deadline,
          qualificationNote: null,
        }))
        .filter((r) => !entry(r.id));
      await stage(rows);
      sql
        .prepare(
          "INSERT INTO opportunity_receipts VALUES('migration','legacy-links-v1','migration',?)",
        )
        .run(JSON.stringify({ count: rows.length }));
      return { count: rows.length };
    });
  }
  async function review(actor: Actor, payload: Record<string, unknown>) {
    adminOnly(actor);
    if (
      Object.keys(payload).some(
        (k) =>
          ![
            "id",
            "expectedRevision",
            "commandId",
            "decision",
            "reason",
            "qualificationNote",
            "verifiedFields",
          ].includes(k),
      )
    )
      fail("VALIDATION_ERROR");
    const id = string(payload.id, 100),
      reason = string(payload.reason, 500);
    const verified = payload.verifiedFields;
    if (
      verified !== undefined &&
      (!verified ||
        typeof verified !== "object" ||
        Array.isArray(verified) ||
        Object.keys(verified).some(
          (k) => !["salaryText", "recruitmentType"].includes(k),
        ))
    )
      fail("VALIDATION_ERROR");
    const fields = verified as Record<string, unknown> | undefined;
    const enrichment: Partial<ExternalOpportunity> = {};
    if (fields?.salaryText !== undefined)
      enrichment.salaryText = string(fields.salaryText, 80);
    if (fields?.recruitmentType !== undefined) {
      const value = string(fields.recruitmentType, 20);
      if (!["全职", "兼职", "实习"].includes(value)) fail("VALIDATION_ERROR");
      enrichment.recruitmentType = value;
    }
    if (
      !Number.isInteger(payload.expectedRevision) ||
      !["publish", "reject", "withdraw"].includes(String(payload.decision))
    )
      fail("VALIDATION_ERROR");
    return transaction(async () => {
      const result = receipt(`review:${actor.userId}`, payload, () => {
        const old = entry(id);
        if (!old) fail("NOT_FOUND");
        if (old.revision !== payload.expectedRevision)
          fail("REVISION_CONFLICT");
        const decision = payload.decision;
        if ((decision === "publish" || decision === "reject") && !old.candidate)
          fail("INVALID_TRANSITION");
        const published =
          decision === "publish"
            ? {
                ...old.candidate!,
                ...enrichment,
                qualificationNote:
                  payload.qualificationNote === undefined
                    ? old.candidate!.qualificationNote
                    : string(payload.qualificationNote, 500, true) || null,
              }
            : old.published;
        const row: OpportunityEntry = {
          ...old,
          published,
          candidate:
            decision === "withdraw" || (decision === "reject" && !old.published)
              ? old.candidate
              : null,
          status:
            decision === "publish"
              ? "published"
              : decision === "withdraw"
                ? "withdrawn"
                : old.status === "withdrawn"
                  ? "withdrawn"
                  : old.published
                    ? "published"
                    : "rejected",
          revision: old.revision + 1,
          reason,
          reviewedAt: clock.now(),
        };
        put(row);
        sql
          .prepare(
            "INSERT INTO opportunity_audit(actor_id,entity_id,action,reason,at) VALUES(?,?,?,?,?)",
          )
          .run(actor.userId, id, String(decision), reason, clock.now());
        return row;
      });
      for (const user of await db.users.toArray())
        if (user.active && ["admin", "student"].includes(user.role))
          signal(user.id);
      return result;
    });
  }
  async function publicExternal() {
    return entries()
      .filter((r) => r.published && r.status !== "withdrawn")
      .map((r) => decorateExternal(r.published!, clock.now()))
      .filter((r) => r.availability === "available");
  }
  async function detail(id: string) {
    const row = entry(id);
    if (!row?.published) fail("NOT_FOUND");
    return decorateExternal(
      row.published,
      clock.now(),
      row.status === "withdrawn",
    );
  }
  async function records(actor: Actor): Promise<OpportunityRecord[]> {
    studentOnly(actor);
    return sql
      .prepare(
        "SELECT data FROM opportunity_records WHERE user_id=? ORDER BY json_extract(data,'$.updatedAt') DESC",
      )
      .all(actor.userId)
      .map((r) => JSON.parse(String(r.data)) as OpportunityRecord)
      .map((r) => {
        const current = entry(r.id);
        return {
          ...r,
          opportunity: current?.published
            ? decorateExternal(
                current.published,
                clock.now(),
                current.status === "withdrawn",
              )
            : { ...r.opportunity, availability: "withdrawn" },
        };
      });
  }
  async function saveRecord(actor: Actor, payload: Record<string, unknown>) {
    studentOnly(actor);
    if (
      Object.keys(payload).some(
        (k) =>
          ![
            "id",
            "expectedRevision",
            "commandId",
            "saved",
            "status",
            "note",
            "activityDate",
          ].includes(k),
      )
    )
      fail("VALIDATION_ERROR");
    const id = string(payload.id, 100),
      note = string(payload.note, 1000, true);
    if (
      typeof payload.saved !== "boolean" ||
      !Number.isInteger(payload.expectedRevision) ||
      Number(payload.expectedRevision) < 0 ||
      !Object.hasOwn(recordStatusLabels, String(payload.status))
    )
      fail("VALIDATION_ERROR");
    const date = payload.activityDate;
    if (
      date !== null &&
      (typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    )
      fail("VALIDATION_ERROR");
    if (payload.status !== "following" && date === null)
      fail("VALIDATION_ERROR");
    return transaction(async () =>
      receipt(`record:${actor.userId}`, payload, () => {
        const previous = decode<OpportunityRecord>(
          sql
            .prepare(
              "SELECT data FROM opportunity_records WHERE user_id=? AND opportunity_id=?",
            )
            .get(actor.userId, id),
        );
        if ((previous?.revision ?? 0) !== payload.expectedRevision)
          fail("REVISION_CONFLICT");
        const row = entry(id);
        if (
          !row?.published ||
          (!previous &&
            decorateExternal(
              row.published,
              clock.now(),
              row.status === "withdrawn",
            ).availability !== "available")
        )
          fail("NOT_FOUND");
        const record: OpportunityRecord = {
          id,
          revision: (previous?.revision ?? 0) + 1,
          saved: payload.saved as boolean,
          status: payload.status as OpportunityRecord["status"],
          note,
          activityDate: date as string | null,
          updatedAt: clock.now(),
          opportunity: decorateExternal(
            row.published,
            clock.now(),
            row.status === "withdrawn",
          ),
        };
        sql
          .prepare(
            "INSERT INTO opportunity_records VALUES(?,?,?,?) ON CONFLICT(user_id,opportunity_id) DO UPDATE SET revision=excluded.revision,data=excluded.data",
          )
          .run(actor.userId, id, record.revision, JSON.stringify(record));
        sql
          .prepare(
            "INSERT INTO opportunity_audit(actor_id,entity_id,action,reason,at) VALUES(?,?,?,?,?)",
          )
          .run(actor.userId, id, "personal-record", "", clock.now());
        signal(actor.userId);
        return record;
      }),
    );
  }
  async function sync(
    actor: Actor,
    transport?: typeof fetch,
    stillAuthorized?: () => Promise<boolean>,
  ) {
    adminOnly(actor);
    const started = clock.now();
    const runId = await transaction<number | bigint>(async () => {
      if (stillAuthorized && !(await stillAuthorized())) fail("FORBIDDEN");
      const last = sql
        .prepare("SELECT MAX(started_at) AS at FROM opportunity_sync")
        .get()?.at;
      if (last && Date.parse(started) - Date.parse(String(last)) < 864e5)
        fail("RATE_LIMITED");
      return sql
        .prepare(
          "INSERT INTO opportunity_sync(started_at,status) VALUES(?,'running')",
        )
        .run(started).lastInsertRowid;
    });
    try {
      const rows = await fetchNcssList(started, transport);
      return await transaction(async () => {
        if (stillAuthorized && !(await stillAuthorized())) fail("FORBIDDEN");
        const result = await stage(rows);
        sql
          .prepare(
            "UPDATE opportunity_sync SET status='staged',count=? WHERE id=?",
          )
          .run(rows.length, runId);
        for (const user of await db.users.toArray())
          if (user.active && user.role === "admin") signal(user.id);
        return result;
      });
    } catch (error) {
      const code =
        error instanceof Error &&
        ["SCHEMA_INVALID", "PAYLOAD_TOO_LARGE", "FORBIDDEN"].includes(
          error.message,
        )
          ? error.message
          : "UPSTREAM_ERROR";
      await transaction(async () => {
        sql
          .prepare(
            "UPDATE opportunity_sync SET status='failed',error=? WHERE id=?",
          )
          .run(code, runId);
      });
      fail(code);
    }
  }
  return {
    stage,
    admin,
    review,
    publicExternal,
    detail,
    records,
    saveRecord,
    sync,
    migrateLegacy,
  };
}
