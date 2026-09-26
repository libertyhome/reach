import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import type { Role, User } from "./types";

type UserRow = User & { password_hash: string; password_salt: string };

export function findUserByEmail(email: string): UserRow | null {
  return (
    (getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as
      | UserRow
      | undefined) ?? null
  );
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(id) as
    | User
    | undefined;
  return row ?? null;
}

export function listUsers(): User[] {
  return getDb().prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY name`).all() as User[];
}

/**
 * Insert a staff row. An existing email is left unchanged, including its password.
 * Seed calls this so a deploy cannot reset a password.
 */
export function upsertUser(input: {
  id: string;
  email: string;
  name: string;
  role: Role;
  password: string;
  createdAt: string;
}) {
  const existing = findUserByEmail(input.email);
  if (existing) return;
  const { hash, salt } = hashPassword(input.password);
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.id, input.email, input.name, input.role, hash, salt, input.createdAt);
}

export function updateStaffLogin(input: {
  email: string;
  password: string;
  name?: string;
  emailNew?: string;
}): { ok: true; email: string; name: string } | { ok: false; error: string } {
  if (input.password.length < 14) {
    return { ok: false, error: "Password must be at least 14 characters." };
  }
  const existing = findUserByEmail(input.email);
  if (!existing) return { ok: false, error: "No staff account uses that email." };
  const nextName = input.name === undefined ? existing.name : input.name.trim();
  if (!nextName) return { ok: false, error: "Display name cannot be empty." };
  const nextEmail = (input.emailNew === undefined ? existing.email : input.emailNew).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return { ok: false, error: "New email is not valid." };
  }
  const clash = findUserByEmail(nextEmail);
  if (clash && clash.id !== existing.id) {
    return { ok: false, error: "Another account already uses that email." };
  }
  const { hash, salt } = hashPassword(input.password);
  getDb()
    .prepare(`UPDATE users SET email = ?, name = ?, password_hash = ?, password_salt = ? WHERE id = ?`)
    .run(nextEmail, nextName, hash, salt, existing.id);
  return { ok: true, email: nextEmail, name: nextName };
}

export function authenticate(email: string, password: string): User | null {
  const row = findUserByEmail(email);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash, row.password_salt)) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  };
}
