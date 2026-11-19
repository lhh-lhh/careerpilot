import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { Database } from "../src/adapters/repository/db";
import { digest, normalizeLogin, reserveAttempt } from './security';
const scrypt = promisify(derive);
export function createAuth(sql: DatabaseSync, db: Database) {
  async function provision(login: string, password: string) {
    if (password.length < 12 || password.length > 256) throw Error("Password must contain 12–256 characters");
    const user = await db.users.filter(u => normalizeLogin(u.login) === normalizeLogin(login)).first();
    if (!user) throw Error("Unknown login");
    const salt = randomBytes(24).toString("hex");
    const hash = (await scrypt(password, salt, 64) as Buffer).toString("hex");
    await db.transaction("rw", db.users, async () => {
      sql.prepare("INSERT INTO credentials VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,hash=excluded.hash").run(user.id, salt, hash);
      sql.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    });
  }
  async function login(name: string, password: string, ip: string) {
    const key = `login:${ip}:${normalizeLogin(name)}`;
    await db.transaction('rw', db.users, async () => {
      reserveAttempt(sql, key, 8);
      reserveAttempt(sql, `login-ip:${ip}`, 100);
    });
    const user = await db.users.filter(u => normalizeLogin(u.login) === normalizeLogin(name)).first();
    const credential = user ? sql.prepare("SELECT salt,hash FROM credentials WHERE user_id=?").get(user.id) : null;
    const salt = String(credential?.salt ?? "invalid-login-dummy-salt");
    const hashed = await scrypt(password.slice(0, 256), salt, 64) as Buffer;
    const expected = credential ? Buffer.from(String(credential.hash), "hex") : Buffer.alloc(64);
    if (!user?.active || !credential || !timingSafeEqual(hashed, expected)) {
      throw Error("INVALID_CREDENTIALS");
    }
    return db.transaction("rw", db.users, async () => {
      const latest = await db.users.get(user.id);
      const current = sql.prepare("SELECT salt,hash FROM credentials WHERE user_id=?").get(user.id);
      if (!latest?.active || current?.salt !== credential.salt || current?.hash !== credential.hash) throw Error("INVALID_CREDENTIALS");
      sql.prepare('DELETE FROM security_limits WHERE key=?').run(digest(key));
      const issuedAt = Date.now();
      sql.prepare("DELETE FROM sessions WHERE expires_at < ?").run(issuedAt);
      const token = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
      sql.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(digest(token), latest.id, csrf, issuedAt + 8 * 3600_000);
      return { token, csrf, actor: { userId: latest.id, role: latest.role }, displayName: latest.displayName, accountStatus: latest.accountStatus ?? 'approved' };
    });
  }
  async function session(cookie = "") {
    const token = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("cp_session="))?.slice(11);
    if (!token) return null;
    return db.transaction("rw", db.users, async () => {
      const record = sql.prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?").get(digest(token), Date.now());
      if (!record) return null;
      const user = await db.users.get(String(record.user_id));
      if (!user?.active) return null;
      return { tokenHash: digest(token), csrf: String(record.csrf), actor: { userId: user.id, role: user.role }, displayName: user.displayName, accountStatus: user.accountStatus ?? 'approved' };
    });
  }
  async function logout(tokenHash: string) {
    await db.transaction("rw", db.users, async () => { sql.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash); });
  }
  async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 12 || newPassword.length > 256) throw Error('BAD_REQUEST');
    await db.transaction('rw', db.users, async () => { reserveAttempt(sql, `password:${userId}`, 8); });
    const credential = sql.prepare('SELECT salt,hash FROM credentials WHERE user_id=?').get(userId);
    const hashed = await scrypt(currentPassword.slice(0, 256), String(credential?.salt ?? 'invalid-login-dummy-salt'), 64) as Buffer;
    if (!credential || !timingSafeEqual(hashed, Buffer.from(String(credential.hash), 'hex'))) throw Error('BAD_REQUEST');
    const salt = randomBytes(24).toString('hex'), hash = (await scrypt(newPassword, salt, 64) as Buffer).toString('hex');
    await db.transaction('rw', db.users, async () => {
      const user = await db.users.get(userId), latest = sql.prepare('SELECT salt,hash FROM credentials WHERE user_id=?').get(userId);
      if (!user?.active || latest?.hash !== credential.hash || latest?.salt !== credential.salt) throw Error('UNAUTHORIZED');
      sql.prepare('UPDATE credentials SET salt=?,hash=? WHERE user_id=?').run(salt, hash, userId);
      sql.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    });
  }
  return { provision, login, session, logout, changePassword };
}
