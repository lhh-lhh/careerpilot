import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";

const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function inspect(path: string) {
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    sql.exec("PRAGMA trusted_schema=OFF");
    if (sql.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw Error("Database integrity check failed");
    const schema = Number(sql.prepare("SELECT MAX(version) AS n FROM schema_migrations").get()?.n);
    if (!Number.isInteger(schema) || schema < 1 || schema > 4) throw Error("Unsupported database schema");
    return schema;
  } finally { sql.close(); }
}
async function reserveDirectory(path: string) {
  await mkdir(dirname(path), { recursive: true });
  // Exclusive directory creation: never merge with or overwrite another backup.
  await mkdir(path, { mode: 0o700 });
}
export async function backupDatabase(source: string, destination: string) {
  const directory = resolve(destination), sourcePath = resolve(source);
  inspect(sourcePath);
  await reserveDirectory(directory);
  const sql = new DatabaseSync(sourcePath, { readOnly: true });
  const snapshot = join(directory, "database.sqlite");
  try { await backup(sql, snapshot); } finally { sql.close(); }
  const schema = inspect(snapshot), bytes = await readFile(snapshot);
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ format: 1, engine: "sqlite", schema, createdAt: new Date().toISOString(), bytes: bytes.length, sha256: checksum(bytes) }, null, 2), { flag: "wx", mode: 0o600 });
  return directory;
}
export async function restoreDatabase(source: string, destination: string) {
  const directory = resolve(source), targetDirectory = resolve(destination);
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  if (manifest.format !== 1 || manifest.engine !== "sqlite" || !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isInteger(manifest.schema)) throw Error("Invalid backup manifest");
  const snapshot = join(directory, "database.sqlite"), bytes = await readFile(snapshot);
  if (bytes.length !== manifest.bytes || checksum(bytes) !== manifest.sha256) throw Error("Backup checksum integrity failure");
  if (inspect(snapshot) !== manifest.schema) throw Error("Backup schema manifest mismatch");
  await reserveDirectory(targetDirectory);
  const target = join(targetDirectory, "careerpilot.sqlite");
  await copyFile(snapshot, target, constants.COPYFILE_EXCL);
  if (checksum(await readFile(target)) !== manifest.sha256) throw Error("Restored checksum integrity failure");
  const restored = new DatabaseSync(target);
  try {
    // Restoring business state must not resurrect stolen or previously revoked sessions.
    restored.exec("DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { restored.close(); }
  inspect(target);
  return target;
}
