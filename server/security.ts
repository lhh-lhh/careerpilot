import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeLogin = (value: string) => value.trim().toLowerCase();
// Each reservation is synchronous and committed before expensive hashing/validation.
export function reserveAttempt(sql: DatabaseSync, key: string, maximum: number, windowMs = 900_000) {
  const now = Date.now();
  sql.prepare('DELETE FROM security_limits WHERE until_at<=?').run(now);
  const hashedKey = digest(key);
  const record = sql.prepare('SELECT n FROM security_limits WHERE key=?').get(hashedKey);
  if (Number(record?.n ?? 0) >= maximum) throw Error('RATE_LIMITED');
  sql.prepare('INSERT INTO security_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1').run(hashedKey, now + windowMs);
}
