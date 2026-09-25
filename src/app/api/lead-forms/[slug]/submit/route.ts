import { NextResponse } from "next/server";
import {
  ATTRIBUTION_KEYS,
  acceptPublicSubmission,
  corsHeaders,
  getLeadFormBySlug,
  allowedHostsFor,
} from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
  return request.headers.get("x-real-ip")?.trim().slice(0, 80) || "unknown";
}

function requestHost(request: Request) {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
}

async function readFields(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        fields[key] = String(value);
      }
    }
    return { fields, json: true };
  }
  const form = await request.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return { fields, json: false };
}

function statusFor(code: string) {
  if (code === "unavailable") return 404;
  if (code === "rate") return 429;
  if (code === "embed") return 403;
  return 400;
}

export async function OPTIONS(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const form = getLeadFormBySlug(slug);
  const headers = corsHeaders(request.headers.get("origin"), form ? allowedHostsFor(form) : [], requestHost(request));
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const form = getLeadFormBySlug(slug);
  const origin = request.headers.get("origin");
  const host = requestHost(request);
  const headers = corsHeaders(origin, form ? allowedHostsFor(form) : [], host);
  if (form && origin && !headers["Access-Control-Allow-Origin"]) {
    return NextResponse.json({ ok: false, error: "This form is not allowed on that site." }, { status: 403, headers });
  }
  let fields: Record<string, string> = {};
  let json = false;
  try {
    const parsed = await readFields(request);
    fields = parsed.fields;
    json = parsed.json;
  } catch {
    return NextResponse.json({ ok: false, error: "We could not read that submission." }, { status: 400, headers });
  }
  const result = await acceptPublicSubmission({ slug, fields, ip: clientIp(request), appHost: host });
  if (json) {
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.code }, { status: statusFor(result.code), headers });
    }
    return NextResponse.json(
      { ok: true, dropped: result.dropped, deduped: result.dropped ? false : result.deduped, personId: result.dropped ? "" : result.personId },
      { status: 200, headers },
    );
  }
  const back = fields.placement === "embed" ? `/f/${slug}/embed` : `/f/${slug}`;
  if (!result.ok) {
    const params = new URLSearchParams();
    params.set("error", result.code);
    for (const key of ATTRIBUTION_KEYS) {
      if (fields[key]) params.set(key, fields[key]);
    }
    return NextResponse.redirect(new URL(`${back}?${params.toString()}`, request.url), { status: 303, headers });
  }
  const thanks = fields.placement === "embed" ? `/f/${slug}/embed?sent=1` : `/f/${slug}/thanks`;
  return NextResponse.redirect(new URL(thanks, request.url), { status: 303, headers });
}
