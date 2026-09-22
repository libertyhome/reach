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

export function upsertUser(input: {
  id: string;
  email: string;
  name: string;
  role: Role;
  password: string;
  createdAt: string;
}) {
  const existing = findUserByEmail(input.email);
  const { hash, salt } = hashPassword(input.password);
  if (existing) {
    getDb()
      .prepare(
        `UPDATE users SET name = ?, role = ?, password_hash = ?, password_salt = ? WHERE email = ?`,
      )
      .run(input.name, input.role, hash, salt, input.email);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.id, input.email, input.name, input.role, hash, salt, input.createdAt);
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
