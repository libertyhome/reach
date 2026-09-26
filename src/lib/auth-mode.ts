/**
 * AUTH_PROVIDER selects how staff sign in.
 * Unset or `demo` keeps today's password sign-in, including for reach-base.
 * `both` and `entra` never fall open to that form when Microsoft is not configured.
 */

import { demoLoginEnabled } from "./demo-login";

export type AuthProvider = "demo" | "both" | "entra";

export function authProviderRaw() {
  return (process.env.AUTH_PROVIDER || "").trim().toLowerCase();
}

export function authProvider(): AuthProvider {
  const raw = authProviderRaw();
  if (!raw || raw === "demo") return "demo";
  if (raw === "both") return "both";
  // Unknown values stay closed. They do not fall open to the demo password.
  return "entra";
}

export function microsoftIssuerUrl(issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "") {
  const trimmed = issuer.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Single-tenant issuer: https://login.microsoftonline.com/<tenant-id>/v2.0 */
export function tenantIdFromIssuer(issuer: string) {
  const url = microsoftIssuerUrl(issuer);
  if (!url) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[parts.length - 1] !== "v2.0") return null;
  const tenant = parts[0] || "";
  if (!tenant || tenant === "common" || tenant === "organizations" || tenant === "consumers") return null;
  return tenant;
}

export type MicrosoftSettings = {
  clientId: string;
  clientSecret: string;
  issuer: string;
  tenantId: string;
};

export function microsoftSettings(): MicrosoftSettings | null {
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim() || "";
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim() || "";
  const issuerUrl = microsoftIssuerUrl();
  if (!clientId || !clientSecret || !issuerUrl) return null;
  const tenantId = tenantIdFromIssuer(issuerUrl.href);
  if (!tenantId) return null;
  return { clientId, clientSecret, issuer: issuerUrl.href, tenantId };
}

export function microsoftConfigured() {
  return microsoftSettings() !== null;
}

export function mfaRequired() {
  const raw = process.env.AUTH_REQUIRE_MFA?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Demo account list and the prefilled password.
 * Uses REACH_DEMO_LOGIN from the production demo-login close: true forces the list on,
 * false forces it off, and unset is off in production. Microsoft modes never show it.
 */
export function showDemoPasswordHints() {
  return authProvider() === "demo" && demoLoginEnabled();
}

export function loginPageModel() {
  const provider = authProvider();
  const configured = microsoftConfigured();
  const notConfigured = provider !== "demo" && !configured;
  const demoList = showDemoPasswordHints();
  let note = "QA uses the demo password below. Production sign-in will be Microsoft 365 with MFA.";
  if (notConfigured) {
    note = "Microsoft sign-in is not configured. Reach will not accept a password until an administrator finishes setup.";
  } else if (provider === "entra") {
    note = "Sign in with Microsoft 365. Multifactor authentication is part of that sign-in.";
  } else if (provider === "both") {
    note = "Sign in with Microsoft 365 and MFA. A password still works during the trial.";
  } else if (!demoList) {
    note = "Production sign-in will be Microsoft 365 with MFA.";
  }
  return {
    provider,
    notConfigured,
    microsoft: provider !== "demo" && configured,
    password: provider === "demo" || (provider === "both" && configured),
    demoList,
    prefill: demoList,
    note,
  };
}

export function microsoftRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/callback/microsoft-entra-id`;
}

/**
 * Reject an unknown AUTH_PROVIDER. Production without REACH_SECRET is refused for every
 * mode by assertProductionSessionSecret (including demo), before this runs.
 */
export function assertAuthStartup() {
  const raw = authProviderRaw();
  if (raw && raw !== "demo" && raw !== "both" && raw !== "entra") {
    throw new Error("AUTH_PROVIDER must be demo, both, or entra.");
  }
}
