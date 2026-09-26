import { writeAudit } from "./audit";
import { getDb } from "./db";
import { hashPassword, newId, verifyPassword } from "./passwords";
import { REACH_STAFF_DOMAIN, microsoftDisplayName, reachStaffByEmail, type ReachStaffGrant } from "./reach-staff";
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
  | { ok: true; user: User; linked: boolean; provisioned: boolean }
  | { ok: false; reason: "unknown" | "unlisted" | "disabled" | "conflict" };

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

function grantsFromEmails(emails: string[]) {
  const grants: ReachStaffGrant[] = [];
  for (const email of emails) {
    const grant = reachStaffByEmail(email);
    if (grant && !grants.some((item) => item.email === grant.email)) grants.push(grant);
  }
  return grants;
}

function refuseMicrosoft(input: {
  reason: "unknown" | "unlisted" | "disabled" | "conflict";
  entityId: string;
  actorId: string;
  summary: string;
  amr: string[];
  email: string;
}): MicrosoftLinkResult {
  auditMicrosoft({
    entityId: input.entityId,
    actorId: input.actorId,
    summary: input.summary,
    amr: input.amr,
    email: input.email,
  });
  return { ok: false, reason: input.reason };
}

function provisionReachUser(grant: ReachStaffGrant, name: string) {
  const { hash, salt } = hashPassword(newId("unusable"));
  const id = newId("user");
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, created_at, auth_disabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, grant.email, name, grant.role, hash, salt, createdAt);
  return findUserByEmail(grant.email);
}

/**
 * Provision or link a Microsoft identity from the confirmed @libertyhomerehab.com staff list.
 * Email match is case-insensitive. Anyone else in the tenant is refused.
 * The ID token name is stored as Microsoft sent it. The directory name is only a fallback.
 * The confirmed role is applied on every successful sign-in.
 */
export function linkMicrosoftSignIn(input: MicrosoftLinkInput): MicrosoftLinkResult {
  const oid = input.oid.trim();
  const amr = input.amr;
  const emails = normalizeEmails(input.emails);
  const microsoftName = (input.name || "").replace(/\s+/g, " ").trim();
  if (!oid) {
    return refuseMicrosoft({
      reason: "unknown",
      entityId: "microsoft",
      actorId: "microsoft",
      summary: `Microsoft sign-in refused (missing oid). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || "",
    });
  }

  const grants = grantsFromEmails(emails);
  if (grants.length > 1) {
    return refuseMicrosoft({
      reason: "conflict",
      entityId: oid,
      actorId: "microsoft",
      summary: `Microsoft sign-in refused (claims matched more than one Reach staff email). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || "",
    });
  }

  const byOid = findUserByOid(oid);
  let grant: ReachStaffGrant | null = grants[0] ?? null;
  if (!grant && byOid) grant = reachStaffByEmail(byOid.email);
  if (!grant) {
    const workEmail = emails.some((email) => email.endsWith(`@${REACH_STAFF_DOMAIN}`));
    return refuseMicrosoft({
      reason: workEmail || byOid ? "unlisted" : "unknown",
      entityId: byOid?.id || oid,
      actorId: byOid?.id || "microsoft",
      summary: workEmail || byOid
        ? `Microsoft sign-in refused (not on the Reach staff list). amr: ${amrLabel(amr)}`
        : `Microsoft sign-in refused (no Reach staff row). amr: ${amrLabel(amr)}`,
      amr,
      email: emails[0] || byOid?.email || "",
    });
  }

  if (byOid && byOid.email !== grant.email) {
    return refuseMicrosoft({
      reason: "conflict",
      entityId: byOid.id,
      actorId: byOid.id,
      summary: `Microsoft sign-in refused (Microsoft account is linked to a different staff email). amr: ${amrLabel(amr)}`,
      amr,
      email: grant.email,
    });
  }

  let row = byOid ? findUserByEmail(byOid.email) : findUserByEmail(grant.email);
  let provisioned = false;
  if (!row) {
    row = provisionReachUser(grant, microsoftDisplayName(microsoftName, grant));
    provisioned = true;
  }
  if (!row) return { ok: false, reason: "unknown" };
  if (row.auth_disabled) {
    return refuseMicrosoft({
      reason: "disabled",
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (disabled). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
  }
  if (row.entra_oid && row.entra_oid !== oid) {
    return refuseMicrosoft({
      reason: "conflict",
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (staff row is linked to a different Microsoft account). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
  }

  const name = microsoftName || row.name;
  try {
    getDb().prepare(`UPDATE users SET entra_oid = ?, role = ?, name = ? WHERE id = ?`).run(oid, grant.role, name, row.id);
  } catch {
    return refuseMicrosoft({
      reason: "conflict",
      entityId: row.id,
      actorId: row.id,
      summary: `Microsoft sign-in refused (oid already linked). amr: ${amrLabel(amr)}`,
      amr,
      email: row.email,
    });
  }
  touchLastLogin(row.id);
  const user = findUserById(row.id);
  if (!user) return { ok: false, reason: "unknown" };
  auditMicrosoft({
    entityId: user.id,
    actorId: user.id,
    summary: provisioned
      ? `Provisioned ${user.email} as ${user.role} and signed in with Microsoft. amr: ${amrLabel(amr)}`
      : `Signed in with Microsoft. amr: ${amrLabel(amr)}`,
    amr,
    email: user.email,
  });
  return { ok: true, user, linked: !row.entra_oid || row.entra_oid !== oid || provisioned, provisioned };
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
