import type { User } from "./types";

/**
 * Leadership pages sit on top of the pipeline nav.
 * `accounts` stays the commercial ops role (invoices, billing) and does not
 * inherit Executive or Creditors. Finance is a separate role.
 * `admissions_manager` sees the Executive dashboard and the admissions pipeline.
 * That role does not see creditors, staff admin, or money pages.
 */
export function canViewExecutive(user: Pick<User, "role">) {
  return user.role === "executive" || user.role === "admissions_manager";
}

/** Staff access page. Executive is the admin desk. */
export function canManageStaff(user: Pick<User, "role">) {
  return user.role === "executive";
}

/** Creditor rows, creditor writes, and the profit-and-loss strip. */
export function canViewCreditors(user: Pick<User, "role">) {
  return user.role === "executive" || user.role === "finance";
}

/**
 * Accounts, invoices, insurance, and visa boards.
 * Admissions and admissions manager stay on the pipeline (and, for the manager, Executive).
 */
export function canViewMoneyPages(user: Pick<User, "role">) {
  return user.role !== "admissions" && user.role !== "admissions_manager";
}

/**
 * Commercial pass-off into Within's waiting list.
 * Reach has no separate admin role; Executive is the admin desk.
 */
export function canSendToWithin(user: Pick<User, "role">) {
  return user.role === "admissions" || user.role === "admissions_manager" || user.role === "executive";
}

/** Lead form builder. Reach has no separate admin role; Executive is the admin desk. */
export function canManageLeadForms(user: Pick<User, "role">) {
  return user.role === "executive";
}
