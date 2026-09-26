/** In-memory login throttle. One process, resets on restart, not shared across replicas. */
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const LOGIN_RATE_LIMIT_ERROR = "Too many sign-in attempts. Try again later.";
export const LOGIN_GENERIC_ERROR = "Check the email and password.";

type AttemptLog = number[];

const attempts = new Map<string, AttemptLog>();

function bucketKey(ip: string, email: string) {
  return `${ip.trim()}|${email.trim().toLowerCase()}`;
}

function recentAttempts(ip: string, email: string, now: number) {
  if (attempts.size > 2000) {
    for (const [key, times] of attempts) {
      const fresh = times.filter((at) => now - at < LOGIN_WINDOW_MS);
      if (fresh.length === 0) attempts.delete(key);
      else attempts.set(key, fresh);
    }
  }
  const key = bucketKey(ip, email);
  const kept = (attempts.get(key) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS);
  if (kept.length === 0) attempts.delete(key);
  else attempts.set(key, kept);
  return kept;
}

export function clientIp(headerList: { get(name: string): string | null }): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 200);
  }
  const real = headerList.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 200);
  return "unknown";
}

export function isLoginRateLimited(ip: string, email: string, now = Date.now()) {
  return recentAttempts(ip, email, now).length >= LOGIN_FAILURE_LIMIT;
}

export function recordLoginFailure(ip: string, email: string, now = Date.now()) {
  const kept = recentAttempts(ip, email, now);
  kept.push(now);
  attempts.set(bucketKey(ip, email), kept);
}

export function clearLoginFailures(ip: string, email: string) {
  attempts.delete(bucketKey(ip, email));
}

export function resetLoginRateLimit() {
  attempts.clear();
}
