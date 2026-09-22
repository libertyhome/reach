/** Edge-safe session helpers. Keep this file free of Node / SQLite imports. */

export const SESSION_COOKIE = "reach_session";

/** userId.hmacHex — reject obviously broken cookies before pages run. */
export function sessionTokenLooksValid(token: string | undefined | null): boolean {
  if (!token) return false;
  const [userId, hmac] = token.split(".");
  if (!userId || !hmac) return false;
  if (!/^[a-zA-Z0-9_:-]+$/.test(userId)) return false;
  if (!/^[0-9a-f]{64}$/i.test(hmac)) return false;
  return true;
}
