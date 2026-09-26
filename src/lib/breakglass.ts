import { writeAudit } from "./audit";
import { verifyBreakglassHash } from "./passwords";
import { takeAttempt } from "./rate-limit";
import { findUserByEmail, findUserById, touchLastLogin } from "./users";
import type { User } from "./types";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

export function breakglassConfigured() {
  return Boolean(process.env.REACH_BREAKGLASS_EMAIL?.trim() && process.env.REACH_BREAKGLASS_PASSWORD_HASH?.trim());
}

export type BreakglassResult =
  | { ok: true; user: User }
  | { ok: false; reason: "unconfigured" | "invalid" | "rate_limited" };

function auditAttempt(input: { entityId: string; actorId: string; summary: string; email: string }) {
  writeAudit({
    personId: input.entityId,
    entityType: "user",
    action: "sign_in",
    summary: input.summary,
    actorId: input.actorId,
    before: null,
    after: { method: "breakglass", email: input.email },
  });
}

/** Every attempt is counted and audited. Five tries per 15 minutes for the emergency email. */
export function attemptBreakglass(input: { email: string; password: string; now?: Date }): BreakglassResult {
  if (!breakglassConfigured()) return { ok: false, reason: "unconfigured" };
  const email = input.email.trim().toLowerCase();
  const expectedEmail = (process.env.REACH_BREAKGLASS_EMAIL || "").trim().toLowerCase();
  const now = input.now ?? new Date();
  const allowed = takeAttempt(`breakglass:${expectedEmail}`, LIMIT, WINDOW_MS, now);
  if (!allowed) {
    auditAttempt({
      entityId: "breakglass",
      actorId: "breakglass",
      summary: "Break-glass attempt was rate limited.",
      email,
    });
    return { ok: false, reason: "rate_limited" };
  }

  const row = email === expectedEmail ? findUserByEmail(email) : null;
  const staff = row ? findUserById(row.id) : null;
  if (!staff || staff.role !== "executive" || staff.auth_disabled) {
    auditAttempt({
      entityId: staff?.id || "breakglass",
      actorId: staff?.id || "breakglass",
      summary: "Break-glass attempt did not match an enabled executive.",
      email,
    });
    return { ok: false, reason: "invalid" };
  }
  const stored = process.env.REACH_BREAKGLASS_PASSWORD_HASH || "";
  if (!verifyBreakglassHash(input.password, stored)) {
    auditAttempt({
      entityId: staff.id,
      actorId: staff.id,
      summary: "Break-glass password was wrong.",
      email,
    });
    return { ok: false, reason: "invalid" };
  }
  touchLastLogin(staff.id);
  auditAttempt({
    entityId: staff.id,
    actorId: staff.id,
    summary: "Break-glass sign-in.",
    email: staff.email,
  });
  const user = findUserById(staff.id);
  if (!user) return { ok: false, reason: "invalid" };
  return { ok: true, user };
}
