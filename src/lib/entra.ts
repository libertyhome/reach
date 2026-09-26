import { createHmac, timingSafeEqual } from "crypto";
import * as oidc from "openid-client";
import { writeAudit } from "./audit";
import { authProvider, mfaRequired, microsoftSettings, type MicrosoftSettings } from "./auth-mode";
import { sessionSecret } from "./session-secret";
import { sha } from "./passwords";
import { linkMicrosoftSignIn, type MicrosoftLinkResult } from "./users";

export const OIDC_COOKIE = "reach_oidc";
const OIDC_TTL_MS = 10 * 60 * 1000;

export type OidcTransaction = {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  redirectUri: string;
  exp: number;
};

export type MicrosoftFailure =
  | "not_configured"
  | "verify"
  | "tenant"
  | "audience"
  | "nonce"
  | "expired"
  | "issuer"
  | "mfa"
  | "unknown"
  | "unlisted"
  | "disabled"
  | "conflict";

export type MicrosoftSignInResult =
  | { ok: true; userId: string; amr: string[]; next: string }
  | { ok: false; reason: MicrosoftFailure };

let cached: { key: string; config: Promise<oidc.Configuration> } | null = null;

export function resetMicrosoftClient() {
  cached = null;
}

function clientCacheKey(settings: MicrosoftSettings) {
  return `${settings.issuer}|${settings.clientId}|${sha(settings.clientSecret)}`;
}

export async function microsoftClient() {
  const settings = microsoftSettings();
  if (!settings) return null;
  const key = clientCacheKey(settings);
  if (!cached || cached.key !== key) {
    const issuer = new URL(settings.issuer);
    const insecure = issuer.protocol === "http:";
    cached = {
      key,
      config: oidc.discovery(issuer, settings.clientId, settings.clientSecret, undefined, {
        execute: insecure ? [oidc.allowInsecureRequests] : [],
      }),
    };
  }
  try {
    return await cached.config;
  } catch (error) {
    cached = null;
    throw error;
  }
}

function signBlob(payload: string) {
  const mac = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function unsignBlob(token: string) {
  const splitAt = token.lastIndexOf(".");
  if (splitAt <= 0) return null;
  const payload = token.slice(0, splitAt);
  const mac = token.slice(splitAt + 1);
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

export function sealOidcTransaction(transaction: OidcTransaction) {
  return signBlob(Buffer.from(JSON.stringify(transaction)).toString("base64url"));
}

export function readOidcTransaction(token: string | undefined | null, now = Date.now()): OidcTransaction | null {
  if (!token) return null;
  const payload = unsignBlob(token);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OidcTransaction;
    if (!parsed.state || !parsed.nonce || !parsed.verifier || !parsed.redirectUri) return null;
    if (!parsed.exp || parsed.exp <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function oidcCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/auth",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(OIDC_TTL_MS / 1000),
  };
}

export async function beginMicrosoftSignIn(input: { next: string; redirectUri: string }) {
  if (authProvider() === "demo") return { ok: false as const, reason: "not_configured" as const };
  const config = await microsoftClient();
  if (!config) return { ok: false as const, reason: "not_configured" as const };
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const nonce = oidc.randomNonce();
  const state = oidc.randomState();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: input.redirectUri,
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  const transaction: OidcTransaction = {
    state,
    nonce,
    verifier,
    next: input.next,
    redirectUri: input.redirectUri,
    exp: Date.now() + OIDC_TTL_MS,
  };
  return { ok: true as const, url: url.href, cookie: sealOidcTransaction(transaction) };
}

function stringClaim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function amrFromClaim(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function assessMicrosoftClaims(
  claims: Record<string, unknown> | undefined,
  expected: { clientId: string; issuer: string; tenantId: string; nonce: string; now?: number },
): { ok: true; amr: string[] } | { ok: false; reason: MicrosoftFailure } {
  if (!claims) return { ok: false, reason: "verify" };
  const now = expected.now ?? Date.now();
  const exp = typeof claims.exp === "number" ? claims.exp : Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return { ok: false, reason: "expired" };
  if (stringClaim(claims.iss).replace(/\/$/, "") !== expected.issuer.replace(/\/$/, "")) {
    return { ok: false, reason: "issuer" };
  }
  const aud = claims.aud;
  const audiences = Array.isArray(aud) ? aud.filter((item): item is string => typeof item === "string") : [stringClaim(aud)];
  if (!audiences.includes(expected.clientId)) return { ok: false, reason: "audience" };
  if (stringClaim(claims.nonce) !== expected.nonce) return { ok: false, reason: "nonce" };
  if (stringClaim(claims.tid) !== expected.tenantId) return { ok: false, reason: "tenant" };
  const amr = amrFromClaim(claims.amr);
  if (mfaRequired() && !amr.some((method) => method.toLowerCase() === "mfa")) {
    return { ok: false, reason: "mfa" };
  }
  return { ok: true, amr };
}

function errorText(error: unknown) {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" ");
}

function classifyOidcError(error: unknown): MicrosoftFailure {
  const message = errorText(error);
  if (message.includes("nonce")) return "nonce";
  if (message.includes('"aud"') || message.includes("audience")) return "audience";
  if (message.includes('"iss"') || message.includes("issuer")) return "issuer";
  if (message.includes("timestamp") || message.includes('"exp"') || message.includes('"iat"')) return "expired";
  return "verify";
}

function auditTokenFailure(reason: MicrosoftFailure, amr: string[]) {
  writeAudit({
    personId: "microsoft",
    entityType: "user",
    action: "sign_in",
    summary: `Microsoft sign-in could not be verified (${reason}). amr: ${amr.length ? amr.join(",") : "none"}`,
    actorId: "microsoft",
    before: null,
    after: { amr, reason, method: "microsoft" },
  });
}

function emailsFromClaims(claims: Record<string, unknown>) {
  return [stringClaim(claims.preferred_username), stringClaim(claims.email), stringClaim(claims.upn)].filter(Boolean);
}

export async function completeMicrosoftSignIn(input: {
  callbackUrl: URL;
  transaction: OidcTransaction;
}): Promise<MicrosoftSignInResult> {
  const settings = microsoftSettings();
  if (!settings || authProvider() === "demo") return { ok: false, reason: "not_configured" };
  const returnedState = input.callbackUrl.searchParams.get("state") || "";
  if (returnedState !== input.transaction.state) return { ok: false, reason: "verify" };
  let claims: Record<string, unknown> | undefined;
  try {
    const config = await microsoftClient();
    if (!config) return { ok: false, reason: "not_configured" };
    const tokens = await oidc.authorizationCodeGrant(config, input.callbackUrl, {
      pkceCodeVerifier: input.transaction.verifier,
      expectedNonce: input.transaction.nonce,
      expectedState: input.transaction.state,
      idTokenExpected: true,
    });
    claims = tokens.claims() as Record<string, unknown> | undefined;
  } catch (error) {
    const reason = classifyOidcError(error);
    auditTokenFailure(reason, []);
    return { ok: false, reason };
  }
  const assessed = assessMicrosoftClaims(claims, {
    clientId: settings.clientId,
    issuer: settings.issuer,
    tenantId: settings.tenantId,
    nonce: input.transaction.nonce,
  });
  if (!assessed.ok) {
    auditTokenFailure(assessed.reason, claims ? amrFromClaim(claims.amr) : []);
    return assessed;
  }
  const linked: MicrosoftLinkResult = linkMicrosoftSignIn({
    oid: stringClaim(claims?.oid),
    emails: claims ? emailsFromClaims(claims) : [],
    amr: assessed.amr,
    name: stringClaim(claims?.name),
  });
  if (!linked.ok) return { ok: false, reason: linked.reason };
  return { ok: true, userId: linked.user.id, amr: assessed.amr, next: input.transaction.next };
}

export async function microsoftEndSessionUrl(postLogoutRedirectUri: string) {
  const config = await microsoftClient();
  if (!config) return null;
  return oidc.buildEndSessionUrl(config, { post_logout_redirect_uri: postLogoutRedirectUri }).href;
}
