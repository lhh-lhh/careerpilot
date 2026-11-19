import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { stores, type Database } from "../src/adapters/repository/db";
import { majorCities } from '../src/data/reference/cities';

type Row = Record<string, unknown>;
const context = new AsyncLocalStorage<object>();
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $blob: Buffer.from(await value.arrayBuffer()).toString("base64"), mime: value.type };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(
    Object.entries(value).map(async ([key, v]) => [key, await encode(v)]),
  ));
  return value;
}
function decode(json: string): Row {
  return JSON.parse(json, (_key, value) => value && typeof value === "object" && "$blob" in value
    ? new Blob([Buffer.from(value.$blob, "base64")], { type: value.mime }) : value);
}
const field = (row: Row, key: string): unknown => key.startsWith("[")
  ? key.slice(1, -1).split("+").map((k) => row[k]) : row[key];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class Collection {
  private predicates: ((row: Row) => boolean)[] = [];
  constructor(private table: SqlTable, private key = "id", private sorted = false) {}
  equals(value: unknown) { this.predicates.push((r) => equal(field(r, this.key), value)); return this; }
  anyOf(values: unknown[]) { this.predicates.push((r) => values.some((v) => equal(field(r, this.key), v))); return this; }
  filter(predicate: (row: Row) => boolean) { this.predicates.push(predicate); return this; }
  async toArray() {
    const rows = this.table.rows().filter((r) => this.predicates.every((fn) => fn(r)));
    if (this.sorted) rows.sort((a, b) => {
      const x = field(a, this.key), y = field(b, this.key);
      return x === y ? 0 : (x as string | number) > (y as string | number) ? 1 : -1;
    });
    return rows;
  }
  async first() { return (await this.toArray())[0]; }
  async count() { return (await this.toArray()).length; }
  async primaryKeys() { return (await this.toArray()).map((r) => r.id); }
  async delete() { const rows = await this.toArray(); for (const row of rows) await this.table.delete(String(row.id)); return rows.length; }
}
class SqlTable {
  constructor(readonly name: string, private sql: DatabaseSync) {}
  rows() { return this.sql.prepare(`SELECT data FROM "${this.name}"`).all().map((r) => decode(String(r.data))); }
  async get(id: string) { const row = this.sql.prepare(`SELECT data FROM "${this.name}" WHERE id=?`).get(id); return row ? decode(String(row.data)) : undefined; }
  async add(row: Row) { this.sql.prepare(`INSERT INTO "${this.name}" (id,data) VALUES (?,?)`).run(String(row.id), JSON.stringify(await encode(row))); return row.id; }
  async put(row: Row) { this.sql.prepare(`INSERT INTO "${this.name}" (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(String(row.id), JSON.stringify(await encode(row))); return row.id; }
  async update(id: string, patch: Row) { const row = await this.get(id); if (!row) return 0; await this.put({ ...row, ...patch }); return 1; }
  async delete(id: string) { this.sql.prepare(`DELETE FROM "${this.name}" WHERE id=?`).run(id); }
  async clear() { this.sql.exec(`DELETE FROM "${this.name}"`); }
  async bulkAdd(rows: Row[]) { for (const row of rows) await this.add(row); }
  async bulkGet(ids: string[]) { return Promise.all(ids.map((id) => this.get(id))); }
  async count() { return Number(this.sql.prepare(`SELECT count(*) AS n FROM "${this.name}"`).get()!.n); }
  where(key: string) { return new Collection(this, key); }
  orderBy(key: string) { return new Collection(this, key, true); }
  filter(fn: (row: Row) => boolean) { return this.toCollection().filter(fn); }
  toArray() { return this.toCollection().toArray(); }
  toCollection() { return new Collection(this); }
}

export function createSqlDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const sql = new DatabaseSync(path);
  sql.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  sql.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const version = Number(sql.prepare("SELECT COALESCE(MAX(version),0) AS n FROM schema_migrations").get()!.n);
  if (version > 4) { sql.close(); throw Error("Database schema is newer than this server"); }
  sql.exec("BEGIN IMMEDIATE");
  try {
    for (const name of Object.keys(stores)) {
      sql.exec(`CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)))`);
      for (const [i, index] of stores[name as keyof typeof stores].split(",").entries()) {
        if (!index.startsWith("&")) continue;
        const keys = index.slice(1).replace(/^\[|\]$/g, "").split("+");
        sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}_u${i}" ON "${name}" (${keys.map((k) => `json_extract(data,'$.${k}')`).join(",")})`);
      }
    }
    sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_signed_agreement ON agreements(json_extract(data,'$.studentId')) WHERE json_extract(data,'$.status')='signed';
      CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bookmarks(user_id TEXT NOT NULL,job_id TEXT NOT NULL,PRIMARY KEY(user_id,job_id));
      CREATE TABLE IF NOT EXISTS changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS changes_user_seq ON changes(user_id,seq);`);
    sql.exec("CREATE TABLE IF NOT EXISTS workspace_media(user_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,base64 TEXT,updated_at TEXT NOT NULL)");
    sql.exec(`CREATE TABLE IF NOT EXISTS account_invites(token_hash TEXT PRIMARY KEY,login TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,created_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS security_limits(key TEXT PRIMARY KEY,n INTEGER NOT NULL,until_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS users_login_normalized ON users(lower(trim(json_extract(data,'$.login'))));`);
    sql.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(1,?)").run(new Date().toISOString());
    sql.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(2,?)").run(new Date().toISOString());
    sql.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(3,?)").run(new Date().toISOString());
    sql.exec(`CREATE TABLE IF NOT EXISTS external_opportunities(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS opportunity_records(user_id TEXT NOT NULL,opportunity_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(user_id,opportunity_id));
      CREATE TABLE IF NOT EXISTS opportunity_receipts(scope TEXT NOT NULL,command_id TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(scope,command_id));
      CREATE TABLE IF NOT EXISTS opportunity_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS opportunity_sync(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE INDEX IF NOT EXISTS opportunity_sync_time ON opportunity_sync(started_at);
      CREATE INDEX IF NOT EXISTS opportunity_status ON external_opportunities(json_extract(data,'$.status'));`);
    sql.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(4,?)").run(new Date().toISOString());
    // Add reference data only for an existing initialized service. Fresh initialization
    // imports the same catalog via bootstrap; never overwrite local catalog edits.
    if(Number(sql.prepare('SELECT count(*) AS n FROM users').get()!.n)>0) {
      const now=new Date().toISOString(),insert=sql.prepare('INSERT OR IGNORE INTO dictionaries(id,data) VALUES(?,?)');
      for(const city of majorCities)insert.run(city.id,JSON.stringify({...city,kind:'city',parentId:null,active:true,revision:1,createdAt:now,updatedAt:now}));
    }
    sql.exec("COMMIT");
  } catch (e) { sql.exec("ROLLBACK"); sql.close(); throw e; }
  const owner = {};
  let tail: Promise<unknown> = Promise.resolve();
  async function transaction<T>(...args: unknown[]): Promise<T> {
    const fn = args.at(-1) as () => Promise<T>;
    if (context.getStore() === owner) return fn();
    const task = tail.then(() => context.run(owner, async () => {
      sql.exec("BEGIN IMMEDIATE");
      try { const result = await fn(); sql.exec("COMMIT"); return result; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    }));
    tail = task.catch(() => undefined);
    return task;
  }
  const tables = Object.keys(stores).map((name) => new SqlTable(name, sql));
  const db = Object.assign(Object.fromEntries(tables.map((table) => [table.name, table])), {
    tables, table: (name: string) => { const table = tables.find((t) => t.name === name); if (!table) throw Error("Unknown table"); return table; },
    open: async () => undefined, transaction,
  }) as unknown as Database;
  return { db, sql, transaction, close: async () => { await tail; sql.close(); } };
}
