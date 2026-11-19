import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createSqlDatabase } from "../server/database";
import { createOpportunities } from "../server/opportunities";
const path = resolve(
  process.env.CAREERPILOT_DATABASE ?? "server-data/service.sqlite",
);
if (!existsSync(path)) throw Error("Database must already be initialized");
const database = createSqlDatabase(path),
  service = createOpportunities(database);
try {
  const user = (await database.db.users.toArray()).find(
    (u) =>
      u.role === "admin" &&
      u.active &&
      (u.accountStatus ?? "approved") === "approved",
  );
  if (!user) throw Error("Active approved administrator required");
  const actor = { userId: user.id, role: "admin" } as const;
  const action = process.argv[2] ?? "preview";
  if (action === "sync") console.log(JSON.stringify(await service.sync(actor)));
  else if (action === "migrate-legacy")
    console.log(JSON.stringify(await service.migrateLegacy()));
  else if (action === "preview")
    console.log(JSON.stringify(await service.admin(actor), null, 2));
  else if (action === "review") {
    const id = process.argv[3],
      revision = Number(process.argv[4]),
      decision = process.argv[5],
      reason = process.argv[6];
    if (!id || !Number.isInteger(revision) || !decision || !reason)
      throw Error(
        "review <id> <revision> <publish|reject|withdraw> <reason> [qualificationNote]",
      );
    console.log(
      JSON.stringify(
        await service.review(actor, {
          id,
          expectedRevision: revision,
          commandId: crypto.randomUUID(),
          decision,
          reason,
          ...(process.argv[7] ? { qualificationNote: process.argv[7] } : {}),
        }),
      ),
    );
  } else throw Error("Use sync, preview or review");
} finally {
  await database.close();
}
