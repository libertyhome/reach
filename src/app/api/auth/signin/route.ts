import { NextResponse } from "next/server";
import { authProvider, microsoftConfigured, microsoftRedirectUri } from "@/lib/auth-mode";
import { beginMicrosoftSignIn, oidcCookieOptions, OIDC_COOKIE } from "@/lib/entra";
import { originFrom } from "@/lib/public-origin";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = originFrom(request.headers);
  const next = safeNext(new URL(request.url).searchParams.get("next") || "");
  if (authProvider() === "demo" || !microsoftConfigured()) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  try {
    const started = await beginMicrosoftSignIn({
      next,
      redirectUri: microsoftRedirectUri(origin),
    });
    if (!started.ok) return NextResponse.redirect(new URL("/login", origin));
    const response = NextResponse.redirect(started.url);
    response.cookies.set(OIDC_COOKIE, started.cookie, oidcCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=microsoft", origin));
  }
}
