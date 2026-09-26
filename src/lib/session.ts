/** Edge-safe session helpers. Keep this file free of Node / SQLite imports. */

import { authProvider } from "./auth-mode";

export const SESSION_COOKIE = "reach_session";

export const SESSION_METHODS = ["demo", "microsoft", "breakglass"] as const;
export type SessionMethod = (typeof SESSION_METHODS)[number];

function userIdOk(userId: string | undefined) {
  return Boolean(userId && /^[a-zA-Z0-9_:-]+$/.test(userId));
}

function hmacOk(hmac: string | undefined) {
  return Boolean(hmac && /^[0-9a-f]{64}$/i.test(hmac));
}

/**
 * Accept the legacy userId.hmac cookie and the v2 userId.iat.exp.method.hmac cookie.
 * This is a shape check only. The signature is checked later, on the server.
 */
export function sessionTokenLooksValid(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length === 2) {
    const [userId, hmac] = parts;
    return userIdOk(userId) && hmacOk(hmac);
  }
  if (parts.length === 5) {
    const [userId, iat, exp, method, hmac] = parts;
    if (!userIdOk(userId) || !hmacOk(hmac)) return false;
    if (!/^\d+$/.test(iat || "") || !/^\d+$/.test(exp || "")) return false;
    if (!SESSION_METHODS.includes(method as SessionMethod)) return false;
    return true;
  }
  return false;
}

/**
 * Middleware gate. Legacy cookies are only treated as signed-in during demo and both.
 * Entra rejects them so an old password session cannot pass the format check.
 */
export function sessionTokenAccepted(token: string | undefined | null, now = Date.now()): boolean {
  if (!sessionTokenLooksValid(token) || !token) return false;
  const parts = token.split(".");
  if (parts.length === 2) return authProvider() !== "entra";
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return false;
  return true;
}
