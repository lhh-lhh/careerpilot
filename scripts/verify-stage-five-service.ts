import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
const origin = "http://127.0.0.1:4174";
assert.deepEqual(await (await fetch(origin + "/api/health")).json(), {
  status: "ok",
  schema: 4,
});
assert.equal((await fetch(origin + "/")).status, 200);
const page = await (await fetch(origin + "/api/public/opportunities")).json();
assert.equal(page.total, 17);
assert.equal(page.items.length, 10);
const credentials = JSON.parse(
  await readFile("server-data/initial-credentials.json", "utf8"),
) as { login: string; password: string }[];
const roles = new Set();
for (const c of credentials) {
  const response = await fetch(origin + "/api/session", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(c),
  });
  assert.equal(response.status, 200);
  const session = await response.json(),
    cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  assert.equal(session.accountStatus, "approved");
  roles.add(session.actor.role);
  assert.equal(
    (await fetch(origin + "/api/account", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  const logout = await fetch(origin + "/api/logout", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "X-CSRF-Token": session.csrf,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(logout.status, 200);
}
assert.equal(roles.size, 4);
const db = new DatabaseSync("server-data/service.sqlite", { readOnly: true });
const counts = Object.fromEntries(
  ["users", "jobs", "applications", "destinations", "opportunity_records"].map(
    (t) => [t, db.prepare(`SELECT count(*) n FROM ${t}`).get()?.n],
  ),
);
assert.equal(counts.users, 5);
assert.equal(counts.jobs, 0);
assert.equal(counts.applications, 0);
assert.equal(counts.destinations, 0);
assert.equal(counts.opportunity_records, 0);
const batch = db
  .prepare(
    "SELECT started_at,count FROM opportunity_sync ORDER BY id DESC LIMIT 1",
  )
  .get();
db.close();
await writeFile(
  "artifacts/stage-five-service-verification.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      health: "schema4 / ok",
      public: page.total,
      accounts: 5,
      roles: 4,
      loginLogout: "passed",
      counts,
      batch,
      credentialsExposed: false,
    },
    null,
    2,
  ),
);
console.log(
  "Actual local service: schema4, 17 public entries, 5 login/logout checks, 4 roles; no fixture business imported.",
);
