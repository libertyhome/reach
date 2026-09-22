import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Clears a broken session outside RSC so the first login navigation stays clean. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/login";
  const dest = new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/login", url.origin);
  if (!dest.pathname.startsWith("/login")) {
    dest.pathname = "/login";
    dest.search = "";
  }
  const response = NextResponse.redirect(dest);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
