import { NextResponse } from "next/server";
import { ingestGoogleLead } from "@/lib/lead-webhooks";

export const dynamic = "force-dynamic";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return request.headers.get("x-real-ip")?.trim().slice(0, 80) || "unknown";
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { google_key?: unknown }) : {};
  const fromBody = typeof record.google_key === "string" ? record.google_key : "";
  const fromQuery = new URL(request.url).searchParams.get("google_key") || "";
  const fromHeader = request.headers.get("x-google-ads-key") || "";
  const result = ingestGoogleLead(body, fromBody || fromQuery || fromHeader, { ip: clientIp(request) });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, leads: result.leads });
}
