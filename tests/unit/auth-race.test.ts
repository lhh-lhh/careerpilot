import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqlDatabase } from "../../server/database";
import { createAuth } from "../../server/auth";
import { createRepository } from "../../src/services/repository";

it("an in-flight old-password login cannot create a session after credentials change", async () => {
  const dir = await mkdtemp(join(tmpdir(), "careerpilot-auth-"));
  const database = createSqlDatabase(join(dir, "test.sqlite"));
  try {
    await createRepository(database.db).initialize();
    const auth = createAuth(database.sql, database.db);
    await auth.provision("student001", "Old-password-for-race!");
    const pending = auth.login("student001", "Old-password-for-race!", "127.0.0.1");
    // Login has read the credential before yielding to the asynchronous scrypt.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    database.sql.prepare("UPDATE credentials SET hash=? WHERE user_id=?").run("00".repeat(64), "user-student-001");
    await expect(pending).rejects.toThrow("INVALID_CREDENTIALS");
    expect(database.sql.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n).toBe(0);
  } finally { await database.close(); await rm(dir, { recursive: true, force: true }); }
});

it("logout is serialized and cannot be undone by an unrelated transaction rollback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "careerpilot-logout-"));
  const database = createSqlDatabase(join(dir, "test.sqlite"));
  try {
    await createRepository(database.db).initialize();
    const auth = createAuth(database.sql, database.db);
    await auth.provision("student001", "Logout-password-for-race!");
    const loggedIn = await auth.login("student001", "Logout-password-for-race!", "127.0.0.1");
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const rollback = database.transaction(async () => { entered(); await gate; throw Error("rollback unrelated write"); }).catch(() => undefined);
    await ready;
    const loggedOut = Promise.resolve(auth.logout(createHash("sha256").update(loggedIn.token).digest("hex")));
    release(); await rollback; await loggedOut;
    expect(await auth.session(`cp_session=${loggedIn.token}`)).toBeNull();
  } finally { await database.close(); await rm(dir, { recursive: true, force: true }); }
});
