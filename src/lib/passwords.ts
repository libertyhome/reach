import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const next = scryptSync(password, salt, 32);
  const current = Buffer.from(hash, "hex");
  if (next.length !== current.length) return false;
  return timingSafeEqual(next, current);
}

/** Railway value format: scrypt$salt$hash. The password itself never goes in the database. */
export function formatBreakglassHash(password: string) {
  const { hash, salt } = hashPassword(password);
  return `scrypt$${salt}$${hash}`;
}

export function verifyBreakglassHash(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) return false;
  if (!/^[0-9a-f]+$/i.test(parts[1]) || !/^[0-9a-f]+$/i.test(parts[2])) return false;
  return verifyPassword(password, parts[2], parts[1]);
}

export function newId(prefix = "") {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
