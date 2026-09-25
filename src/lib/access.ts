import type { User } from "./types";

/**
 * Leadership pages sit on top of the pipeline nav.
 * `accounts` stays the commercial ops role (invoices, billing) and does not
 * inherit Executive or Creditors. Finance is a separate role.
 */
export function canViewExecutive(user: Pick<User, "role">) {
  return user.role === "executive";
}

export function canViewCreditors(user: Pick<User, "role">) {
  return user.role === "executive" || user.role === "finance";
}

/**
 * Commercial pass-off into Within's waiting list.
 * Reach has no separate admin role; Executive is the admin desk.
 */
export function canSendToWithin(user: Pick<User, "role">) {
  return user.role === "admissions" || user.role === "executive";
}

/** Lead form builder. Reach has no separate admin role; Executive is the admin desk. */
export function canManageLeadForms(user: Pick<User, "role">) {
  return user.role === "executive";
}
