import { NextResponse } from "next/server";
import { checkRateLimit, WEBHOOK_RATE_LIMIT } from "@/lib/lead-forms";
import { ingestMetaLeadgen, metaSignatureStatus, metaVerifyChallenge } from "@/lib/lead-webhooks";

export const dynamic = "force-dynamic";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return request.headers.get("x-real-ip")?.trim().slice(0, 80) || "unknown";
}

export async function GET(request: Request) {
  const result = metaVerifyChallenge(new URL(request.url).searchParams);
  return new Response(result.body, { status: result.status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const raw = await request.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  const signature = metaSignatureStatus(raw, request.headers.get("x-hub-signature-256"));
  if (signature !== "ok") {
    if (!checkRateLimit(ip, "webhook:meta", WEBHOOK_RATE_LIMIT.limit, WEBHOOK_RATE_LIMIT.windowMs)) {
      return NextResponse.json({ ok: false, error: "Too many webhook deliveries." }, { status: 429 });
    }
    if (signature === "unconfigured") {
      return NextResponse.json({ ok: false, error: "META_APP_SECRET is not set" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON" }, { status: 400 });
  }
  const result = await ingestMetaLeadgen(body, { ip });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, leads: result.leads });
}
