import { redirect } from "next/navigation";
import { canManageLeadForms, canManageStaff, canViewCreditors, canViewExecutive, canViewMoneyPages } from "./access";
import { getCurrentUser } from "./auth";
import { seedIfEmpty } from "./seed";
import type { User } from "./types";

export async function requireStaff(): Promise<User> {
  seedIfEmpty();
  const user = await getCurrentUser();
  if (!user) {
    // Route handler clears the cookie — RSC cannot mutate cookies during render.
    redirect("/api/session/clear?next=/login");
  }
  return user;
}

/** Executive occupancy and analytics. Admissions manager may open this page. Other roles go back to the pipeline. */
export async function requireExecutiveAccess(): Promise<User> {
  const user = await requireStaff();
  if (!canViewExecutive(user)) redirect("/enquiries");
  return user;
}

/** Staff admin. Executive only — admissions manager does not manage staff. */
export async function requireStaffAdmin(): Promise<User> {
  const user = await requireStaff();
  if (!canManageStaff(user)) redirect("/enquiries");
  return user;
}

/** Accounts, invoices, insurance, and visa. Admissions roles are sent back to the pipeline. */
export async function requireMoneyAccess(): Promise<User> {
  const user = await requireStaff();
  if (!canViewMoneyPages(user)) redirect("/enquiries");
  return user;
}

/** Lead form builder and the source report. Executive (admin desk) only. */
export async function requireLeadFormAdmin(): Promise<User> {
  const user = await requireStaff();
  if (!canManageLeadForms(user)) redirect("/enquiries");
  return user;
}

/** Creditors and the Sage P&L strip. Executive or finance only. */
export async function requireCreditorsAccess(): Promise<User> {
  const user = await requireStaff();
  if (!canViewCreditors(user)) redirect("/enquiries");
  return user;
}
