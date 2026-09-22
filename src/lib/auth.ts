import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { seedIfEmpty } from "./seed";
import { SESSION_COOKIE, sessionTokenLooksValid } from "./session";
import { authenticate, findUserById } from "./users";
import type { User } from "./types";

export { SESSION_COOKIE, sessionTokenLooksValid };
const SECRET = process.env.REACH_SECRET || "reach-liberty-home-demo-secret";

function sign(userId: string) {
  const hmac = createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

function unsign(token: string) {
  if (!sessionTokenLooksValid(token)) return null;
  const [userId, hmac] = token.split(".");
  if (!userId || !hmac) return null;
  const expected = createHmac("sha256", SECRET).update(userId).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

export async function login(email: string, password: string) {
  seedIfEmpty();
  const user = authenticate(email.trim().toLowerCase(), password);
  if (!user) return null;
  const jar = await cookies();
  // Clear any stale/partial cookie first so the first post-login navigation sees one clean session.
  jar.delete(SESSION_COOKIE);
  jar.set(SESSION_COOKIE, sign(user.id), cookieOptions);
  return user;
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Read-only session lookup. Does not mutate cookies (safe in RSC). */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = unsign(token);
  if (!userId) return null;
  seedIfEmpty();
  return findUserById(userId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
