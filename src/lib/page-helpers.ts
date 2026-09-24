import { redirect } from "next/navigation";
import { canViewCreditors, canViewExecutive } from "./access";
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

/** Executive occupancy and analytics. Other roles are sent back to the pipeline. */
export async function requireExecutiveAccess(): Promise<User> {
  const user = await requireStaff();
  if (!canViewExecutive(user)) redirect("/enquiries");
  return user;
}

/** Creditors and the Sage P&L strip. Executive or finance only. */
export async function requireCreditorsAccess(): Promise<User> {
  const user = await requireStaff();
  if (!canViewCreditors(user)) redirect("/enquiries");
  return user;
}
