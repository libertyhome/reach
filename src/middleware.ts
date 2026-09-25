import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowedHostsFor, frameAncestorsCsp, getActiveLeadFormBySlug } from "@/lib/lead-forms";
import { SESSION_COOKIE, sessionTokenLooksValid } from "@/lib/session";

export const runtime = "nodejs";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = sessionTokenLooksValid(token);
  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isPublic = pathname === "/privacy" || pathname.startsWith("/f/");

  if (!valid && !isLogin && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", next);
    const response = NextResponse.redirect(url);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (valid && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/enquiries";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!valid && isLogin && token) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const response = NextResponse.next();
  const embedMatch = pathname.match(/^\/f\/([^/]+)\/embed\/?$/);
  if (embedMatch) {
    let policy = frameAncestorsCsp([]);
    try {
      const form = getActiveLeadFormBySlug(decodeURIComponent(embedMatch[1]));
      if (form) policy = frameAncestorsCsp(allowedHostsFor(form));
    } catch {
      policy = frameAncestorsCsp([]);
    }
    response.headers.set("Content-Security-Policy", policy);
  } else if (/^\/f\/[^/]+$/.test(pathname)) {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand).*)"],
};
