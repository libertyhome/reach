import type { Role } from "./types";

/** Work accounts that may open Reach. Matching is case-insensitive. */
export const REACH_STAFF_DOMAIN = "libertyhomerehab.com";

export type ReachStaffGrant = {
  email: string;
  role: Role;
  /**
   * Confirmed Microsoft display name. Used only when the ID token has no name.
   * A name claim is stored as Microsoft sent it.
   */
  name?: string;
};

/**
 * Confirmed staff who may be provisioned from Entra.
 * Display names that are confirmed use the Microsoft spelling.
 * Thembani is the house manager, and Kelly is Day RA and Admin at the Lodge.
 * Both get the admissions view only, with no money pages.
 */
export const REACH_STAFF: readonly ReachStaffGrant[] = [
  { email: "vincent@libertyhomerehab.com", role: "executive" },
  { email: "morgane@libertyhomerehab.com", role: "executive" },
  { email: "mel@libertyhomerehab.com", role: "executive" },
  { email: "sinead@libertyhomerehab.com", role: "finance" },
  { email: "jenna@libertyhomerehab.com", role: "finance" },
  { email: "mmapule@libertyhomerehab.com", role: "admissions_manager", name: "Mmapule Mohajane" },
  { email: "cindy@libertyhomerehab.com", role: "admissions", name: "Cindy De Smidt" },
  { email: "thembani@libertyhomerehab.com", role: "admissions" },
  { email: "kelly@libertyhomerehab.com", role: "admissions", name: "Kelly" },
];

/** Local password on the normal sign-in form while AUTH_PROVIDER=both. */
export const BREAKGLASS_PASSWORD_EMAILS = [
  "vincent@libertyhomerehab.com",
  "morgane@libertyhomerehab.com",
] as const;

export function normalizeStaffEmail(value: string) {
  return value.trim().toLowerCase();
}

export function reachStaffByEmail(email: string): ReachStaffGrant | null {
  const normalized = normalizeStaffEmail(email);
  return REACH_STAFF.find((row) => row.email === normalized) ?? null;
}

export function allowsBreakglassPassword(email: string) {
  const normalized = normalizeStaffEmail(email);
  return (BREAKGLASS_PASSWORD_EMAILS as readonly string[]).includes(normalized);
}

export function microsoftDisplayName(claimName: string, grant: ReachStaffGrant) {
  const fromMicrosoft = claimName.replace(/\s+/g, " ").trim();
  if (fromMicrosoft) return fromMicrosoft;
  if (grant.name) return grant.name;
  const local = grant.email.split("@")[0];
  return local || grant.email;
}
