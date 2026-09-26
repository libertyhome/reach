import { getDb } from "./db";
import { newId } from "./passwords";

export function takeAttempt(bucket: string, limit: number, windowMs: number, now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const purgeBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM auth_attempts WHERE created_at < ?`).run(purgeBefore);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM auth_attempts WHERE bucket = ? AND created_at >= ?`)
    .get(bucket, cutoff) as { n: number };
  if (row.n >= limit) return false;
  db.prepare(`INSERT INTO auth_attempts (id, bucket, created_at) VALUES (?, ?, ?)`).run(
    newId("att"),
    bucket,
    now.toISOString(),
  );
  return true;
}

export function resetAuthAttempts(bucketPrefix = "") {
  if (!bucketPrefix) {
    getDb().prepare(`DELETE FROM auth_attempts`).run();
    return;
  }
  getDb().prepare(`DELETE FROM auth_attempts WHERE bucket LIKE ?`).run(`${bucketPrefix}%`);
}
