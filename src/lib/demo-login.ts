/**
 * Public demo login: the account list, the prefilled password, and a known
 * password on newly created staff rows.
 *
 * REACH_DEMO_LOGIN=true forces this on, including in production.
 * REACH_DEMO_LOGIN=false forces it off.
 * When the variable is unset, demo login is off if NODE_ENV=production and on otherwise.
 *
 * reach-base shares this codebase. Set REACH_DEMO_LOGIN=true on that service
 * to keep today's demo sign-in. Production Reach leaves the variable unset.
 * Seed never rewrites an existing staff password, in either mode.
 */
export function demoLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.REACH_DEMO_LOGIN?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.NODE_ENV !== "production";
}

export const DEMO_LOGIN_ACCOUNTS = [
  { role: "Therapist", email: "therapist@liberty.local" },
  { role: "Admissions", email: "admissions@liberty.local" },
  { role: "Accounts", email: "accounts@liberty.local" },
  { role: "Finance", email: "finance@liberty.local" },
  { role: "Executive", email: "executive@liberty.local" },
] as const;

const DEMO_LOGIN_QUICK_PICKS = [
  { role: "Admissions", email: "admissions@liberty.local" },
  { role: "Accounts", email: "accounts@liberty.local" },
  { role: "Therapist", email: "therapist@liberty.local" },
] as const;

export type LoginAccount = { role: string; email: string };

export type LoginPresentation = {
  accounts: LoginAccount[];
  quickPicks: LoginAccount[];
  prefillEmail: string;
  prefillPassword: string;
  demoNote: string;
  demoHeading: string;
};

const EMPTY_LOGIN: LoginPresentation = {
  accounts: [],
  quickPicks: [],
  prefillEmail: "",
  prefillPassword: "",
  demoNote: "",
  demoHeading: "",
};

/** Copy and defaults for /login. Demo off has no accounts, no prefill, and no known password. */
export function loginPresentation(demo: boolean): LoginPresentation {
  if (!demo) return EMPTY_LOGIN;
  return {
    accounts: [...DEMO_LOGIN_ACCOUNTS],
    quickPicks: [...DEMO_LOGIN_QUICK_PICKS],
    prefillEmail: "admissions@liberty.local",
    prefillPassword: "liberty",
    demoNote: "QA uses the demo password below. Production sign-in will be Microsoft 365 with MFA.",
    demoHeading: "Demo staff (password: liberty)",
  };
}
