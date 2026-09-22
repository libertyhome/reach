import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, sessionTokenLooksValid } from "@/lib/session";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = sessionTokenLooksValid(token);
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!valid && !isLogin) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand).*)"],
};
