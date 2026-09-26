import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { readSessionToken } from "@/lib/auth";
import { microsoftConfigured } from "@/lib/auth-mode";
import { microsoftEndSessionUrl, oidcCookieOptions, OIDC_COOKIE } from "@/lib/entra";
import { originFrom } from "@/lib/public-origin";
import { SESSION_COOKIE } from "@/lib/session";
import { findUserById } from "@/lib/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function finish(request: Request) {
  const origin = originFrom(request.headers);
  const jar = await cookies();
  const session = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    const user = findUserById(session.userId);
    if (user) {
      writeAudit({
        personId: user.id,
        entityType: "user",
        action: "sign_out",
        summary: `Signed out (${session.method}).`,
        actorId: user.id,
        before: null,
        after: { method: session.method },
      });
    }
  }
  let destination = new URL("/login", origin).href;
  if (session?.method === "microsoft" && microsoftConfigured()) {
    try {
      const endSession = await microsoftEndSessionUrl(new URL("/login", origin).href);
      if (endSession) destination = endSession;
    } catch {
      destination = new URL("/login", origin).href;
    }
  }
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  return finish(request);
}

export async function POST(request: Request) {
  return finish(request);
}
