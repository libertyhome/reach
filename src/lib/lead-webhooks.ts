import { createHmac } from "crypto";
import {
  WEBHOOK_RATE_LIMIT,
  checkRateLimit,
  getLeadFormByExternalKey,
  safeEqual,
  submitMappedLead,
  type Attribution,
} from "./lead-forms";
import type { MarketingLeadSource } from "./marketing-sources";

export type GraphLead = {
  id?: string;
  field_data?: { name?: string; values?: string[] }[];
};

export type WebhookResult =
  | { ok: true; leads: { personId: string; duplicate: boolean }[] }
  | { ok: false; status: number; error: string };

export function metaSignatureStatus(rawBody: string, header: string | null): "ok" | "reject" | "unconfigured" {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return "unconfigured";
  if (!header?.startsWith("sha256=")) return "reject";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  return safeEqual(given, expected) ? "ok" : "reject";
}

export function metaVerifyChallenge(params: URLSearchParams): { status: number; body: string } {
  const expected = process.env.META_LEADGEN_VERIFY_TOKEN;
  if (!expected) return { status: 503, body: "META_LEADGEN_VERIFY_TOKEN is not set" };
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") || "";
  const challenge = params.get("hub.challenge") || "";
  if (mode === "subscribe" && challenge && safeEqual(token, expected)) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: "Forbidden" };
}

export function googleKeyStatus(provided: string): "ok" | "reject" | "unconfigured" {
  const expected = process.env.GOOGLE_ADS_WEBHOOK_KEY;
  if (!expected) return "unconfigured";
  if (!provided || !safeEqual(provided, expected)) return "reject";
  return "ok";
}

type MetaChange = {
  field?: string;
  value?: { leadgen_id?: string | number; form_id?: string | number; page_id?: string | number };
};

function metaChanges(body: unknown): MetaChange[] {
  if (!body || typeof body !== "object") return [];
  const entry = (body as { entry?: { changes?: MetaChange[] }[] }).entry;
  if (!Array.isArray(entry)) return [];
  const changes: MetaChange[] = [];
  for (const item of entry) {
    for (const change of item?.changes ?? []) changes.push(change);
  }
  return changes;
}

function fieldMap(fields: { name?: string; values?: string[] }[] | undefined) {
  const map = new Map<string, string>();
  for (const field of fields ?? []) {
    const name = String(field.name ?? "").trim().toLowerCase();
    const value = (field.values ?? []).map((item) => String(item).trim()).filter(Boolean).join(", ").slice(0, 2000);
    if (!name || !value) continue;
    if (/token|secret|password/.test(name)) continue;
    map.set(name, value);
  }
  return map;
}

function pick(map: Map<string, string>, tests: ((name: string) => boolean)[]) {
  for (const test of tests) {
    for (const [name, value] of map) {
      if (test(name)) return value;
    }
  }
  return "";
}

function looseName(name: string, fragments: string[]) {
  return fragments.some((fragment) => name === fragment || name.includes(fragment));
}

async function defaultFetchMetaLead(leadId: string): Promise<GraphLead | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return null;
  if (!/^\d+$/.test(leadId)) throw new Error("Meta lead id is not numeric.");
  const version = process.env.META_GRAPH_VERSION || "v21.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_VERSION is not a valid Graph version.");
  const url = new URL(`https://graph.facebook.com/${version}/${leadId}`);
  url.searchParams.set("access_token", token);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error(`Meta Graph API request failed for lead ${leadId}.`);
  }
  if (!response.ok) throw new Error(`Meta Graph API returned ${response.status} for lead ${leadId}.`);
  return (await response.json()) as GraphLead;
}

function sourceFor(externalKey: string, fallback: MarketingLeadSource) {
  const form = externalKey ? getLeadFormByExternalKey(externalKey) : null;
  if (!form) return { formId: "", source: fallback, campaign: "", leadSourceWho: "" };
  return {
    formId: form.id,
    source: form.lead_source,
    campaign: form.campaign,
    leadSourceWho: form.lead_source_who,
  };
}

export async function ingestMetaLeadgen(
  body: unknown,
  options?: {
    fetchLead?: (leadId: string) => Promise<GraphLead | null>;
    ip?: string;
    now?: Date;
  },
): Promise<WebhookResult> {
  const now = options?.now ?? new Date();
  if (!checkRateLimit(options?.ip || "meta", "webhook:meta", WEBHOOK_RATE_LIMIT.limit, WEBHOOK_RATE_LIMIT.windowMs, now)) {
    return { ok: false, status: 429, error: "Too many webhook deliveries." };
  }
  const fetchLead = options?.fetchLead ?? defaultFetchMetaLead;
  const leads: { personId: string; duplicate: boolean }[] = [];
  for (const change of metaChanges(body)) {
    if (change.field && change.field !== "leadgen") continue;
    const leadId = String(change.value?.leadgen_id ?? "").trim();
    if (!leadId) continue;
    const formKey = String(change.value?.form_id ?? "").trim();
    let graph: GraphLead | null = null;
    let fetched = false;
    try {
      graph = await fetchLead(leadId);
      fetched = graph != null;
    } catch {
      return { ok: false, status: 500, error: "Meta lead details could not be fetched. The delivery can be retried." };
    }
    const fields = fieldMap(graph?.field_data);
    const first = pick(fields, [(name) => name === "first_name"]);
    const last = pick(fields, [(name) => name === "last_name"]);
    const full = pick(fields, [
      (name) => name === "full_name" || name === "full name",
      (name) => looseName(name, ["full_name", "full name"]),
    ]);
    const callerName = full || [first, last].filter(Boolean).join(" ") || `Meta ${leadId}`;
    const email = pick(fields, [(name) => looseName(name, ["email"])]);
    const phone = pick(fields, [(name) => looseName(name, ["phone"])]);
    const country = pick(fields, [(name) => name === "country" || name.includes("country")]);
    const resident = pick(fields, [(name) => name.includes("resident")]);
    const house = pick(fields, [(name) => name.includes("house") || name.includes("facility")]);
    const message = pick(fields, [(name) => name.includes("message") || name.includes("comment") || name.includes("question")]);
    const linked = sourceFor(formKey, "meta_ads");
    const note = fetched
      ? "Consent collected on the Meta lead form."
      : "Meta sent the lead id only. Set META_PAGE_ACCESS_TOKEN so Reach can fetch the name and contact details.";
    const saved = submitMappedLead({
      source: linked.source,
      campaign: linked.campaign,
      leadSourceWho: linked.leadSourceWho,
      formId: linked.formId,
      channel: "meta",
      callerName,
      residentName: resident,
      phone,
      email,
      country,
      preferredHouse: house,
      message,
      consent: true,
      externalId: `meta:${leadId}`,
      extraNote: note,
      now,
    });
    if (!saved.ok) return { ok: false, status: 500, error: "The Meta lead could not be saved." };
    if (!saved.dropped) leads.push({ personId: saved.personId, duplicate: saved.duplicate });
  }
  return { ok: true, leads };
}

type GoogleColumn = { column_name?: string; column_id?: string; string_value?: string };
type GoogleBody = {
  lead_id?: string | number;
  google_key?: string;
  gcl_id?: string;
  form_id?: string | number;
  campaign_id?: string | number;
  is_test?: boolean;
  user_column_data?: GoogleColumn[];
};

export function ingestGoogleLead(body: unknown, providedKey: string, options?: { ip?: string; now?: Date }): WebhookResult {
  const keyStatus = googleKeyStatus(providedKey);
  if (keyStatus === "unconfigured") {
    return { ok: false, status: 503, error: "GOOGLE_ADS_WEBHOOK_KEY is not set" };
  }
  const now = options?.now ?? new Date();
  if (!checkRateLimit(options?.ip || "google", "webhook:google", WEBHOOK_RATE_LIMIT.limit, WEBHOOK_RATE_LIMIT.windowMs, now)) {
    return { ok: false, status: 429, error: "Too many webhook deliveries." };
  }
  if (keyStatus === "reject") return { ok: false, status: 401, error: "Invalid google_key" };
  if (!body || typeof body !== "object") return { ok: false, status: 400, error: "Expected a JSON lead." };
  const payload = body as GoogleBody;
  const leadId = String(payload.lead_id ?? "").trim();
  if (!leadId) return { ok: false, status: 400, error: "lead_id is required" };
  const columns = new Map<string, string>();
  for (const column of payload.user_column_data ?? []) {
    const name = `${column.column_id ?? ""} ${column.column_name ?? ""}`.trim().toLowerCase();
    const value = String(column.string_value ?? "").trim().slice(0, 2000);
    if (!name || !value) continue;
    if (/token|secret|password/.test(name)) continue;
    columns.set(name, value);
  }
  const fullName = pick(columns, [
    (name) => name.includes("full_name") || name.includes("full name"),
    (name) => name.includes("user name") || name === "name",
  ]);
  const first = pick(columns, [(name) => name.includes("first name") || name.includes("first_name")]);
  const last = pick(columns, [(name) => name.includes("last name") || name.includes("last_name")]);
  const callerName = fullName || [first, last].filter(Boolean).join(" ") || `Google ${leadId}`;
  const email = pick(columns, [(name) => name.includes("email")]);
  const phone = pick(columns, [(name) => name.includes("phone")]);
  const country = pick(columns, [(name) => name.includes("country")]);
  const resident = pick(columns, [(name) => name.includes("resident")]);
  const house = pick(columns, [(name) => name.includes("house") || name.includes("facility")]);
  const message = pick(columns, [(name) => name.includes("message") || name.includes("comment")]);
  const formKey = String(payload.form_id ?? "").trim();
  const linked = sourceFor(formKey, "google_adwords");
  const campaign = linked.campaign || (payload.campaign_id ? `Campaign ${payload.campaign_id}` : "");
  const attribution: Partial<Attribution> = {};
  if (payload.gcl_id) attribution.gclid = String(payload.gcl_id).slice(0, 300);
  const saved = submitMappedLead({
    source: linked.source,
    campaign,
    leadSourceWho: linked.leadSourceWho,
    formId: linked.formId,
    channel: "google",
    callerName,
    residentName: resident,
    phone,
    email,
    country,
    preferredHouse: house,
    message,
    consent: true,
    attribution,
    externalId: `google:${leadId}`,
    extraNote: payload.is_test
      ? "Test lead from Google Ads. Consent collected on the Google lead form."
      : "Consent collected on the Google lead form.",
    now,
  });
  if (!saved.ok || saved.dropped) return { ok: false, status: 500, error: "The Google lead could not be saved." };
  return { ok: true, leads: [{ personId: saved.personId, duplicate: saved.duplicate }] };
}
