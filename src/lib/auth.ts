import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { writeAudit } from "./audit";
import { authProvider, microsoftConfigured } from "./auth-mode";
import { sessionSecret } from "./session-secret";
import { seedIfEmpty } from "./seed";
import { SESSION_COOKIE, sessionTokenLooksValid, type SessionMethod } from "./session";
import { allowsBreakglassPassword } from "./reach-staff";
import { authenticate, findUserById, touchLastLogin } from "./users";
import type { User } from "./types";

export { SESSION_COOKIE, sessionTokenLooksValid };
export type { SessionMethod };

export const SESSION_TTL_SECONDS: Record<SessionMethod, number> = {
  demo: 60 * 60 * 24 * 14,
  microsoft: 60 * 60 * 12,
  breakglass: 60 * 60,
};

export function sessionCookieOptions(method: SessionMethod) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS[method],
  };
}

function hmacHex(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function hmacMatches(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Legacy cookie: userId.HMAC(userId). Kept so demo and break-glass-trial sessions still open. */
export function issueLegacySessionToken(userId: string) {
  return `${userId}.${hmacHex(userId)}`;
}

/** v2 cookie: userId.iat.exp.method.HMAC */
export function issueSessionToken(userId: string, method: SessionMethod, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const exp = iat + SESSION_TTL_SECONDS[method];
  const payload = `${userId}.${iat}.${exp}.${method}`;
  return `${payload}.${hmacHex(payload)}`;
}

export function readSessionToken(
  token: string | undefined | null,
  now = Date.now(),
): { userId: string; method: SessionMethod; iat: number | null; exp: number | null } | null {
  if (!sessionTokenLooksValid(token) || !token) return null;
  const parts = token.split(".");
  if (parts.length === 2) {
    if (authProvider() === "entra") return null;
    const [userId, hmac] = parts;
    if (!userId || !hmac || !hmacMatches(hmac, hmacHex(userId))) return null;
    return { userId, method: "demo" as const, iat: null, exp: null };
  }
  const [userId, iatRaw, expRaw, method, hmac] = parts;
  if (!userId || !iatRaw || !expRaw || !method || !hmac) return null;
  const payload = `${userId}.${iatRaw}.${expRaw}.${method}`;
  if (!hmacMatches(hmac, hmacHex(payload))) return null;
  const iat = Number(iatRaw);
  const exp = Number(expRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= nowSeconds || iat > nowSeconds + 60) return null;
  if (method === "demo" || method === "microsoft" || method === "breakglass") {
    return { userId, method: method as SessionMethod, iat, exp };
  }
  return null;
}

export function buildSessionCookie(userId: string, method: SessionMethod, now = Date.now()) {
  return {
    name: SESSION_COOKIE,
    value: issueSessionToken(userId, method, now),
    options: sessionCookieOptions(method),
  };
}

export async function establishSession(user: User, method: SessionMethod) {
  const jar = await cookies();
  const built = buildSessionCookie(user.id, method);
  jar.delete(SESSION_COOKIE);
  jar.set(built.name, built.value, built.options);
  touchLastLogin(user.id);
  if (method === "demo") {
    writeAudit({
      personId: user.id,
      entityType: "user",
      action: "sign_in",
      summary: "Signed in with a password.",
      actorId: user.id,
      before: null,
      after: { method: "demo", amr: [] },
    });
  }
  return user;
}

export type PasswordLoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "password_disabled" | "breakglass_only" | "not_configured" | "invalid" };

/** Why a local password must be refused before the password is checked. Null means the form may try. */
export function localPasswordRefusal(email: string): "password_disabled" | "breakglass_only" | "not_configured" | null {
  const provider = authProvider();
  if (provider !== "demo" && !microsoftConfigured()) return "not_configured";
  if (provider === "entra") return "password_disabled";
  if (provider === "both" && !allowsBreakglassPassword(email)) return "breakglass_only";
  return null;
}

export async function login(email: string, password: string): Promise<PasswordLoginResult> {
  const refusal = localPasswordRefusal(email);
  if (refusal) return { ok: false, reason: refusal };
  seedIfEmpty();
  const user = authenticate(email.trim().toLowerCase(), password);
  if (!user) return { ok: false, reason: "invalid" };
  await establishSession(user, "demo");
  return { ok: true, user };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<{ user: User; method: SessionMethod } | null> {
  const jar = await cookies();
  const parsed = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  seedIfEmpty();
  const user = findUserById(parsed.userId);
  if (!user || user.auth_disabled) return null;
  return { user, method: parsed.method };
}

/** Read-only session lookup. Does not mutate cookies (safe in RSC). */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
