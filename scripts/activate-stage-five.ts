import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSqlDatabase } from "../server/database";
import { createOpportunities } from "../server/opportunities";
import type { OpportunityEntry } from "../src/types/opportunities";
import { restoreDatabase } from "../server/backup";

// One-time, local operator cutover. No network, accounts, passwords or business fixtures imported.
const trial = process.argv[2] === "--trial-upgrade";
if (!trial && process.argv[2] !== "--confirm-local-upgrade")
  throw Error("Explicit local cutover confirmation required");
const actual = trial
    ? await restoreDatabase(
        resolve("artifacts/stage-five-rollback/database-before-upgrade"),
        resolve("artifacts/stage-five-migration-trial"),
      )
    : resolve("server-data/service.sqlite"),
  source = resolve("artifacts/stage-five-qa/service.sqlite");
const backup = JSON.parse(
  await readFile(
    resolve(
      "artifacts/stage-five-rollback/database-before-upgrade/manifest.json",
    ),
    "utf8",
  ),
);
assert.equal(backup.schema, 3);
const proof = new DatabaseSync(actual, { readOnly: true }),
  qa = new DatabaseSync(source, { readOnly: true });
const fingerprint = (db: DatabaseSync) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => String(r.name))
          .filter(
            (n) =>
              !n.startsWith("sqlite_") &&
              !n.startsWith("opportunity_") &&
              n !== "external_opportunities" &&
              n !== "schema_migrations",
          )
          .map((n) => [
            n,
            db.prepare(`SELECT * FROM "${n}" ORDER BY rowid`).all(),
          ]),
      ),
    )
    .digest("hex");
const before = fingerprint(proof);
assert.equal(
  proof.prepare("SELECT MAX(version) n FROM schema_migrations").get()?.n,
  3,
);
proof.close();
const entries = qa
  .prepare("SELECT data FROM external_opportunities ORDER BY id")
  .all()
  .map((r) => JSON.parse(String(r.data)) as OpportunityEntry);
const runs = qa
  .prepare(
    "SELECT started_at,status,count,error FROM opportunity_sync ORDER BY id",
  )
  .all();
qa.close();
assert.equal(entries.length, 20);
assert.equal(entries.filter((r) => r.status === "published").length, 17);
assert.equal(entries.filter((r) => r.status === "rejected").length, 3);
assert.equal(runs.length, 1);
assert.equal(runs[0]?.count, 20);
const database = createSqlDatabase(actual),
  opportunities = createOpportunities(database);
try {
  assert.equal(
    database.sql.prepare("SELECT count(*) n FROM external_opportunities").get()
      ?.n,
    0,
  );
  const admin = (await database.db.users.toArray()).find(
    (u) => u.active && u.role === "admin" && u.accountStatus === "approved",
  );
  assert(admin);
  await database.transaction(async () => {
    for (const row of entries) {
      if (row.published)
        assert.equal(
          row.published.url,
          `https://www.ncss.cn/student/jobs/${row.id.slice(5)}/detail.html`,
        );
      database.sql
        .prepare("INSERT INTO external_opportunities VALUES(?,?,?)")
        .run(row.id, row.revision, JSON.stringify(row));
      database.sql
        .prepare(
          "INSERT INTO opportunity_audit(actor_id,entity_id,action,reason,at) VALUES(?,?,?,?,?)",
        )
        .run(
          admin.id,
          row.id,
          "initialize-reviewed-index",
          row.reason,
          new Date().toISOString(),
        );
    }
    for (const r of runs)
      database.sql
        .prepare(
          "INSERT INTO opportunity_sync(started_at,status,count,error) VALUES(?,?,?,?)",
        )
        .run(r.started_at!, r.status!, r.count!, r.error ?? null);
    await opportunities.migrateLegacy();
    assert.equal(
      fingerprint(database.sql),
      before,
      "Existing accounts, credentials and business state must not change",
    );
  });
  await writeFile(
    resolve(
      trial
        ? "artifacts/stage-five-migration-trial.json"
        : "artifacts/stage-five-cutover.json",
    ),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        schema: 4,
        sourceBatch: runs[0]?.started_at,
        published: (await opportunities.publicExternal()).length,
        entries: (
          await opportunities.admin({ userId: admin.id, role: "admin" })
        ).entries.length,
        existingStateFingerprint: before,
        unchanged: true,
        networkRequests: 0,
        rollback: "artifacts/stage-five-rollback/database-before-upgrade",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    "Schema4 local cutover: 17 published, original accounts/business unchanged, no network requests.",
  );
} finally {
  await database.close();
}
