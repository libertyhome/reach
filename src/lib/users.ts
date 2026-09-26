import { writeAudit } from "./audit";
import { getDb } from "./db";
import { hashPassword, newId, verifyPassword } from "./passwords";
import { ROLES, type Role, type User } from "./types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  password_salt: string;
  created_at: string;
  entra_oid: string | null;
  last_login_at: string | null;
  auth_disabled: number | null;
};

function presentUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
    entra_oid: row.entra_oid || null,
    last_login_at: row.last_login_at || null,
    auth_disabled: row.auth_disabled ? 1 : 0,
  };
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function findUserByEmail(email: string): UserRow | null {
  return (
    (getDb().prepare(`SELECT * FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as UserRow | undefined) ??
    null
  );
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? presentUser(row) : null;
}

export function findUserByOid(oid: string): User | null {
  const trimmed = oid.trim();
  if (!trimmed) return null;
  const row = getDb().prepare(`SELECT * FROM users WHERE entra_oid = ?`).get(trimmed) as UserRow | undefined;
  return row ? presentUser(row) : null;
}

export function listUsers(): User[] {
  const rows = getDb().prepare(`SELECT * FROM users ORDER BY name`).all() as UserRow[];
  return rows.map(presentUser);
}

export function touchLastLogin(userId: string, at = new Date().toISOString()) {
  getDb().prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(at, userId);
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
  const email = input.email.trim().toLowerCase();
  const existing = findUserByEmail(email);
  if (existing) return;
  const { hash, salt } = hashPassword(input.password);
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, created_at, auth_disabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(input.id, email, input.name, input.role, hash, salt, input.createdAt);
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
  if (row.auth_disabled) return null;
  if (!verifyPassword(password, row.password_hash, row.password_salt)) return null;
  return presentUser(row);
}

export type MicrosoftLinkInput = {
  oid: string;
  emails: string[];
  amr: string[];
  name?: string;
};

export type MicrosoftLinkResult =
  | { ok: true; user: User; linked: boolean }
  | { ok: false; reason: "unknown" | "disabled" | "conflict" };

function amrLabel(amr: string[]) {
  return amr.length ? amr.join(",") : "none";
}

function auditMicrosoft(input: {
  entityId: string;
  actorId: string;
  summary: string;
  amr: string[];
  email: string;
}) {
  writeAudit({
    personId: input.entityId,
    entityType: "user",
    action: "sign_in",
    summary: input.summary,
    actorId: input.actorId,
    before: null,
    after: { amr: input.amr, email: input.email, method: "microsoft" },
  });
}

function normalizeEmails(emails: string[]) {
  const seen = new Set<string>();
  const usable: string[] = [];
  for (const value of emails) {
    const email = value.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email.endsWith("@liberty.local")) continue;
    usable.push(email);
  }
  return usable;
}

/**
 * Match a Microsoft identity to an existing staff row.
 * oid wins. Otherwise the first lowercased preferred_username, email, or upn that equals users.email.
 * @liberty.local rows are never matched. Nothing is created automatically.
 */
export function linkMicrosoftSignIn(input: MicrosoftLinkInput): MicrosoftLinkResult {
  const oid = input.oid.trim();
  const amr = input.amr;
  const emails = normalizeEmails(input.emails);
  if (!oid) {
    auditMicrosoft({
      entityId: "microsoft",
      actorId: "microsoft",
      summary: `Microsoft sign-in refused (missing oid). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || "",
    });
    return { ok: false, reason: "unknown" };
  }

  const byOid = findUserByOid(oid);
  if (byOid) {
    if (byOid.auth_disabled) {
      auditMicrosoft({
        entityId: byOid.id,
        actorId: byOid.id,
        summary: `Microsoft sign-in refused (disabled). amr: ${amrLabel(amr)}`,
        amr,
        email: byOid.email,
      });
      return { ok: false, reason: "disabled" };
    }
    touchLastLogin(byOid.id);
    auditMicrosoft({
      entityId: byOid.id,
      actorId: byOid.id,
      summary: `Signed in with Microsoft. amr: ${amrLabel(amr)}`,
      amr,
      email: byOid.email,
    });
    return { ok: true, user: { ...byOid, last_login_at: new Date().toISOString() }, linked: false };
  }

  const matches: UserRow[] = [];
  for (const email of emails) {
    const row = findUserByEmail(email);
    if (row && !matches.some((item) => item.id === row.id)) matches.push(row);
  }
  if (matches.length === 0) {
    auditMicrosoft({
      entityId: oid,
      actorId: "microsoft",
      summary: `Microsoft sign-in refused (no Reach staff row). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || "",
    });
    return { ok: false, reason: "unknown" };
  }
  if (matches.length > 1) {
    auditMicrosoft({
      entityId: oid,
      actorId: "microsoft",
      summary: `Microsoft sign-in refused (email matched more than one staff row). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || "",
    });
    return { ok: false, reason: "conflict" };
  }

  const row = matches[0];
  if (!row) return { ok: false, reason: "unknown" };
  if (row.auth_disabled) {
    auditMicrosoft({
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (disabled). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
    return { ok: false, reason: "disabled" };
  }
  if (row.entra_oid && row.entra_oid !== oid) {
    auditMicrosoft({
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (staff row is linked to a different Microsoft account). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
    return { ok: false, reason: "conflict" };
  }

  try {
    getDb().prepare(`UPDATE users SET entra_oid = ? WHERE id = ?`).run(oid, row.id);
  } catch {
    auditMicrosoft({
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (oid already linked). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
    return { ok: false, reason: "conflict" };
  }
  touchLastLogin(row.id);
  const user = findUserById(row.id);
  if (!user) return { ok: false, reason: "unknown" };
  auditMicrosoft({
    entityId: user.id,
    actorId: user.id,
    summary: `Signed in with Microsoft. amr: ${amrLabel(amr)}`,
    amr,
    email: user.email,
  });
  return { ok: true, user, linked: true };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enabledExecutiveCount(exceptId?: string) {
  return listUsers().filter((user) => user.role === "executive" && !user.auth_disabled && user.id !== exceptId).length;
}

export function createStaffUser(input: { name: string; email: string; role: string; actorId: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false as const, error: "Enter a name." };
  if (!EMAIL_PATTERN.test(email)) return { ok: false as const, error: "Enter a valid email." };
  if (!isRole(input.role)) return { ok: false as const, error: "Choose a role." };
  if (findUserByEmail(email)) return { ok: false as const, error: "That email is already on the staff list." };
  const { hash, salt } = hashPassword(newId("unusable"));
  const id = newId("user");
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, created_at, auth_disabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, email, name, input.role, hash, salt, createdAt);
  writeAudit({
    personId: id,
    entityType: "user",
    action: "staff_change",
    summary: `Added staff ${name} (${email}) as ${input.role}`,
    actorId: input.actorId,
    before: null,
    after: { email, role: input.role },
  });
  const user = findUserById(id);
  if (!user) return { ok: false as const, error: "Staff row could not be saved." };
  return { ok: true as const, user };
}

export function updateStaffRole(input: { userId: string; role: string; actorId: string }) {
  const user = findUserById(input.userId);
  if (!user) return { ok: false as const, error: "That staff row is gone." };
  if (!isRole(input.role)) return { ok: false as const, error: "Choose a role." };
  if (user.role === "executive" && input.role !== "executive" && !user.auth_disabled && enabledExecutiveCount(user.id) === 0) {
    return { ok: false as const, error: "Keep at least one executive who can sign in." };
  }
  getDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).run(input.role, user.id);
  writeAudit({
    personId: user.id,
    entityType: "user",
    action: "staff_change",
    summary: `Changed ${user.email} from ${user.role} to ${input.role}`,
    actorId: input.actorId,
    before: null,
    after: { role: input.role },
  });
  return { ok: true as const };
}

export function setStaffDisabled(input: { userId: string; disabled: boolean; actorId: string }) {
  const user = findUserById(input.userId);
  if (!user) return { ok: false as const, error: "That staff row is gone." };
  if (input.disabled && user.id === input.actorId) {
    return { ok: false as const, error: "You cannot disable your own sign-in." };
  }
  if (input.disabled && user.role === "executive" && !user.auth_disabled && enabledExecutiveCount(user.id) === 0) {
    return { ok: false as const, error: "Keep at least one executive who can sign in." };
  }
  getDb().prepare(`UPDATE users SET auth_disabled = ? WHERE id = ?`).run(input.disabled ? 1 : 0, user.id);
  writeAudit({
    personId: user.id,
    entityType: "user",
    action: "staff_change",
    summary: input.disabled ? `Disabled sign-in for ${user.email}` : `Enabled sign-in for ${user.email}`,
    actorId: input.actorId,
    before: null,
    after: { auth_disabled: input.disabled ? 1 : 0 },
  });
  return { ok: true as const };
}

export function unlinkMicrosoft(input: { userId: string; actorId: string }) {
  const user = findUserById(input.userId);
  if (!user) return { ok: false as const, error: "That staff row is gone." };
  getDb().prepare(`UPDATE users SET entra_oid = NULL WHERE id = ?`).run(user.id);
  writeAudit({
    personId: user.id,
    entityType: "user",
    action: "staff_change",
    summary: `Unlinked Microsoft from ${user.email}`,
    actorId: input.actorId,
    before: null,
    after: { entra_oid: null },
  });
  return { ok: true as const };
}
