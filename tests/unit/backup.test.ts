import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSqlDatabase } from "../../server/database";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it("a WAL snapshot restores the latest committed data to a new location and revokes sessions", async () => {
  const { backupDatabase, restoreDatabase } = await import("../../server/backup");
  const root = await mkdtemp(join(tmpdir(), "careerpilot-backup-")); roots.push(root);
  const source = createSqlDatabase(join(root, "source.sqlite"));
  try {
    await source.db.users.add({ id: "backup-user", revision: 1, createdAt: "2026-11-13T00:00:00Z", updatedAt: "2026-11-13T00:00:00Z", login: "backup-login", displayName: "保存到WAL的用户", role: "student", active: true, studentId: null, companyId: null });
    source.sql.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run("token-hash", "backup-user", "csrf-value", Date.now() + 100000);
    const backupDir = join(root, "backup");
    await backupDatabase(join(root, "source.sqlite"), backupDir);
    await source.db.users.update("backup-user", { displayName: "快照之后的修改" });
    const destination = await restoreDatabase(backupDir, join(root, "restored"));
    const restored = createSqlDatabase(destination);
    try {
      expect((await restored.db.users.get("backup-user"))?.displayName).toBe("保存到WAL的用户");
      expect(restored.sql.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n).toBe(0);
      expect((await readFile(join(backupDir, "manifest.json"), "utf8"))).not.toMatch(/token-hash|csrf-value|backup-login|保存到WAL/);
    } finally { await restored.close(); }
    await expect(restoreDatabase(backupDir, join(root, "restored"))).rejects.toThrow(/exist/i);
    await expect(backupDatabase(join(root, "source.sqlite"), backupDir)).rejects.toThrow(/exist/i);
  } finally { await source.close(); }
});
it("tampered or incomplete backups never create a usable restored database", async () => {
  const { backupDatabase, restoreDatabase } = await import("../../server/backup");
  const root = await mkdtemp(join(tmpdir(), "careerpilot-backup-corrupt-")); roots.push(root);
  const source = createSqlDatabase(join(root, "source.sqlite")); await source.close();
  await backupDatabase(join(root, "source.sqlite"), join(root, "backup"));
  const snapshot = join(root, "backup", "database.sqlite");
  const sql = new DatabaseSync(snapshot); sql.exec("CREATE TABLE tampered(id INTEGER)"); sql.close();
  await expect(restoreDatabase(join(root, "backup"), join(root, "rejected"))).rejects.toThrow(/integrity|checksum/i);
  await writeFile(join(root, "backup", "manifest.json"), "{}");
  await expect(restoreDatabase(join(root, "backup"), join(root, "invalid"))).rejects.toThrow(/manifest/i);
});
