import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { microsoftRedirectUri } from "@/lib/auth-mode";
import { buildSessionCookie } from "@/lib/auth";
import { completeMicrosoftSignIn, oidcCookieOptions, OIDC_COOKIE, readOidcTransaction } from "@/lib/entra";
import { originFrom } from "@/lib/public-origin";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failureReason(reason: string) {
  if (reason === "unknown" || reason === "disabled" || reason === "conflict" || reason === "mfa") return reason;
  return "verify";
}

export async function GET(request: Request) {
  const origin = originFrom(request.headers);
  const incoming = new URL(request.url);
  const callbackUrl = new URL(microsoftRedirectUri(origin));
  callbackUrl.search = incoming.search;
  const jar = await cookies();
  const transaction = readOidcTransaction(jar.get(OIDC_COOKIE)?.value);
  const failed = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/login/no-access?reason=${failureReason(reason)}`, origin));
    response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(), maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!transaction) return failed("verify");
  let result;
  try {
    result = await completeMicrosoftSignIn({ callbackUrl, transaction });
  } catch {
    return failed("verify");
  }
  if (!result.ok) {
    if (result.reason === "not_configured") {
      const response = NextResponse.redirect(new URL("/login", origin));
      response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(), maxAge: 0 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return failed(result.reason);
  }
  const built = buildSessionCookie(result.userId, "microsoft");
  const response = NextResponse.redirect(new URL(safeNext(result.next), origin));
  response.cookies.set(built.name, built.value, built.options);
  response.cookies.set(OIDC_COOKIE, "", { ...oidcCookieOptions(), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
