import { timingSafeEqual } from "crypto";
import { applyPersonPatch, createEnquiry } from "./pipeline";
import { getDb } from "./db";
import {
  canonicalLeadSource,
  isMarketingLeadSource,
  leadSourceNeedsWho,
  marketingSourceLabel,
  staffLeadSource,
  type MarketingLeadSource,
} from "./marketing-sources";
import { newId } from "./passwords";
import type { House, User } from "./types";

export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RATE_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };
export const WEBHOOK_RATE_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "referrer_url",
  "landing_url",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Record<AttributionKey, string>;

export type LeadForm = {
  id: string;
  name: string;
  slug: string;
  lead_source: MarketingLeadSource;
  campaign: string;
  lead_source_who: string;
  allowed_domains: string;
  external_key: string;
  privacy_url: string;
  active: number;
  created_at: string;
  updated_at: string;
};

export type EnquiryIntake = {
  person_id: string;
  form_id: string;
  form_name: string;
  form_slug: string;
  caller_name: string;
  resident_name: string;
  country: string;
  preferred_house: string;
  intake_source: string;
  campaign: string;
  message: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  gclid: string;
  fbclid: string;
  referrer_url: string;
  landing_url: string;
  popia_consent: number;
  channel: string;
  created_at: string;
  updated_at: string;
};

export type EnquiryTouch = {
  id: string;
  person_id: string;
  form_id: string;
  channel: string;
  caller_name: string;
  resident_name: string;
  phone: string;
  email: string;
  country: string;
  preferred_house: string;
  message: string;
  intake_source: string;
  campaign: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  gclid: string;
  fbclid: string;
  referrer_url: string;
  landing_url: string;
  popia_consent: number;
  external_id: string;
  created_at: string;
};

export type IntakeErrorCode =
  | "unavailable"
  | "rate"
  | "embed"
  | "turnstile"
  | "consent"
  | "contact"
  | "email"
  | "phone"
  | "name"
  | "invalid";

export type AcceptResult =
  | { ok: true; dropped: true }
  | { ok: true; dropped: false; deduped: boolean; duplicate: boolean; personId: string }
  | { ok: false; code: IntakeErrorCode };

const LEAD_INTAKE_ACTOR: User = {
  id: "system_lead_forms",
  email: "lead-forms@reach.local",
  name: "Lead forms",
  role: "admissions",
  created_at: "2026-01-01T00:00:00.000Z",
  entra_oid: null,
  last_login_at: null,
  auth_disabled: 0,
};

export function emptyAttribution(): Attribution {
  return {
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    gclid: "",
    fbclid: "",
    referrer_url: "",
    landing_url: "",
  };
}

export function intakeErrorMessage(code: string) {
  switch (code) {
    case "rate":
      return "Too many submissions from this network. Please wait a few minutes and try again.";
    case "embed":
      return "This form is not allowed on that website.";
    case "turnstile":
      return "Please confirm you are not a robot, then send the form again.";
    case "consent":
      return "Tick the box to confirm you agree to the privacy notice.";
    case "contact":
      return "Add a phone number or an email address so admissions can reply.";
    case "email":
      return "Enter a valid email address.";
    case "phone":
      return "Enter a phone number admissions can call.";
    case "name":
      return "Add the caller's name.";
    case "unavailable":
      return "This form is not available.";
    default:
      return "We could not save that enquiry. Please try again.";
  }
}

export function preferredHouseLabel(value: string) {
  if (value === "manor") return "Manor";
  if (value === "lodge") return "Lodge";
  if (value === "unsure") return "Unsure";
  return "";
}

export function slugifyLeadForm(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "form";
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return "";
  if (email.length > 200) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

/** Last 9 digits, so 082… and +27 82… match. Shorter numbers are stored but not deduped. */
export function phoneKey(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 9) return "";
  return digits.slice(-9);
}

export function splitPersonName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0].slice(0, 80), last: "—" };
  return { first: parts[0].slice(0, 80), last: parts.slice(1).join(" ").slice(0, 80) };
}

export function safeHttpUrl(value: string, max = 2000) {
  const trimmed = value.trim().slice(0, max);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function safePrivacyUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/privacy";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) return trimmed.slice(0, 300);
  const absolute = safeHttpUrl(trimmed, 300);
  if (absolute.startsWith("https://")) return absolute;
  return "";
}

export function parseAllowedDomains(raw: string) {
  const hosts = new Set<string>();
  for (const line of raw.split(/[\s,]+/)) {
    if (!line) continue;
    let host = line.trim().toLowerCase();
    if (host.includes("://")) {
      try {
        host = new URL(host).hostname;
      } catch {
        continue;
      }
    }
    host = host.replace(/^\*\./, "").split("/")[0].split(":")[0];
    if (!/^[a-z0-9.-]+$/.test(host) || host.length > 253) continue;
    hosts.add(host);
    if (hosts.size >= 30) break;
  }
  return [...hosts];
}

function hostsMatch(left: string, right: string) {
  const a = left.toLowerCase().replace(/\.$/, "");
  const b = right.toLowerCase().replace(/\.$/, "");
  if (!a || !b) return false;
  if (a === b) return true;
  const bareA = a.replace(/^www\./, "");
  const bareB = b.replace(/^www\./, "");
  return bareA === bareB;
}

function hostIsListed(host: string, allowed: string[]) {
  const bare = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((item) => {
    const target = item.replace(/^www\./, "");
    return hostsMatch(host, item) || (target.includes(".") && bare.endsWith(`.${target}`));
  });
}

export function isOriginAllowed(originHeader: string | null, allowedHosts: string[], requestHost: string) {
  if (!originHeader) return true;
  let originHost = "";
  try {
    originHost = new URL(originHeader).hostname;
  } catch {
    return false;
  }
  if (requestHost && hostsMatch(originHost, requestHost)) return true;
  if (allowedHosts.length === 0) return false;
  return hostIsListed(originHost, allowedHosts);
}

export function embedParentAllowed(parentUrl: string, allowedHosts: string[], appHost: string) {
  // An empty parent is a direct preview, or a browser that hid the referrer.
  // Framing is still limited by the embed page's frame-ancestors policy.
  if (!parentUrl.trim()) return true;
  let host = "";
  try {
    host = new URL(parentUrl).hostname;
  } catch {
    return false;
  }
  if (appHost && hostsMatch(host, appHost)) return true;
  if (allowedHosts.length === 0) return false;
  return hostIsListed(host, allowedHosts);
}

export function frameAncestorsCsp(allowedHosts: string[]) {
  const sources = ["'self'"];
  for (const host of allowedHosts) {
    if (host === "localhost" || host.startsWith("127.")) {
      sources.push(`http://${host}`, `https://${host}`);
    } else {
      sources.push(`https://${host}`);
    }
  }
  return `frame-ancestors ${sources.join(" ")}`;
}

export function corsHeaders(originHeader: string | null, allowedHosts: string[], requestHost: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (originHeader && isOriginAllowed(originHeader, allowedHosts, requestHost)) {
    headers["Access-Control-Allow-Origin"] = originHeader;
  }
  return headers;
}

export function attributionFromRecord(source: Record<string, string | undefined>): Attribution {
  const next = emptyAttribution();
  for (const key of ATTRIBUTION_KEYS) {
    const raw = String(source[key] ?? "").trim();
    if (!raw) continue;
    if (key === "referrer_url" || key === "landing_url") {
      next[key] = safeHttpUrl(raw);
    } else {
      next[key] = raw.slice(0, 300);
    }
  }
  return next;
}

export function attributionFromSearch(params: URLSearchParams): Attribution {
  const record: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) record[key] = params.get(key) ?? "";
  return attributionFromRecord(record);
}

export function leadFormSnippets(origin: string, slug: string) {
  const base = origin.replace(/\/$/, "");
  const hosted = `${base}/f/${slug}`;
  const iframe = `<iframe src="${base}/f/${slug}/embed" title="Liberty Home enquiry" style="width:100%;min-height:920px;border:0;"></iframe>`;
  const script = `<script src="${base}/api/lead-forms/${slug}/script" async></script>`;
  return { hosted, iframe, script };
}

export function turnstileSiteKey() {
  if (!process.env.TURNSTILE_SECRET_KEY) return "";
  return process.env.TURNSTILE_SITE_KEY?.trim() || "";
}

export async function verifyTurnstileToken(token: string, ip: string, fetchImpl: typeof fetch = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { success?: boolean };
    return payload.success === true;
  } catch {
    return false;
  }
}

function clamp(value: string, max: number) {
  return value.trim().slice(0, max);
}

function mapLeadForm(row: LeadForm): LeadForm {
  const source = canonicalLeadSource(row.lead_source) ?? row.lead_source;
  return {
    ...row,
    lead_source: source,
    lead_source_who: row.lead_source_who ?? "",
    active: row.active ? 1 : 0,
  };
}

export function listLeadForms(): LeadForm[] {
  return getDb()
    .prepare(`SELECT * FROM lead_forms ORDER BY updated_at DESC, name ASC`)
    .all()
    .map((row) => mapLeadForm(row as LeadForm));
}

export function getLeadForm(id: string): LeadForm | null {
  const row = getDb().prepare(`SELECT * FROM lead_forms WHERE id = ?`).get(id) as LeadForm | undefined;
  return row ? mapLeadForm(row) : null;
}

export function getLeadFormBySlug(slug: string): LeadForm | null {
  const row = getDb().prepare(`SELECT * FROM lead_forms WHERE slug = ?`).get(slug) as LeadForm | undefined;
  return row ? mapLeadForm(row) : null;
}

export function getActiveLeadFormBySlug(slug: string): LeadForm | null {
  const form = getLeadFormBySlug(slug);
  if (!form || form.active !== 1) return null;
  return form;
}

export function getLeadFormByExternalKey(externalKey: string): LeadForm | null {
  const key = externalKey.trim();
  if (!key) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM lead_forms WHERE external_key = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(key) as LeadForm | undefined;
  return row ? mapLeadForm(row) : null;
}

export function allowedHostsFor(form: Pick<LeadForm, "allowed_domains">) {
  return parseAllowedDomains(form.allowed_domains);
}

export type LeadFormInput = {
  name: string;
  slug?: string;
  leadSource: string;
  leadSourceWho?: string;
  campaign: string;
  allowedDomains: string;
  externalKey: string;
  privacyUrl: string;
  active: boolean;
};

export function saveLeadForm(input: LeadFormInput, id?: string): { ok: true; form: LeadForm } | { ok: false; error: string } {
  const name = clamp(input.name, 80);
  if (!name) return { ok: false, error: "Give the form a name." };
  const leadSource = canonicalLeadSource(input.leadSource);
  if (!leadSource || !isMarketingLeadSource(leadSource)) return { ok: false, error: "Choose a lead source." };
  const privacy = safePrivacyUrl(input.privacyUrl);
  if (!privacy) return { ok: false, error: "Privacy link must be a site path or an https URL." };
  const hosts = parseAllowedDomains(input.allowedDomains);
  const requestedSlug = clamp(input.slug || "", 60);
  const base = requestedSlug || slugifyLeadForm(name);
  if (!isValidSlug(base)) {
    return { ok: false, error: "Use a slug made of lowercase letters, numbers, and hyphens." };
  }
  const slug = uniqueSlug(base, id);
  if (requestedSlug && slug !== requestedSlug) return { ok: false, error: "That slug is already used." };
  const now = new Date().toISOString();
  const externalKey = clamp(input.externalKey, 120);
  const row = {
    name,
    slug,
    lead_source: leadSource,
    campaign: clamp(input.campaign, 120),
    lead_source_who: leadSourceNeedsWho(leadSource) ? clamp(input.leadSourceWho ?? "", 160) : "",
    allowed_domains: hosts.join("\n"),
    external_key: externalKey,
    privacy_url: privacy,
    active: input.active ? 1 : 0,
    updated_at: now,
  };
  if (id) {
    const existing = getLeadForm(id);
    if (!existing) return { ok: false, error: "That form no longer exists." };
    getDb()
      .prepare(
        `UPDATE lead_forms SET
          name = @name, slug = @slug, lead_source = @lead_source, campaign = @campaign,
          lead_source_who = @lead_source_who,
          allowed_domains = @allowed_domains, external_key = @external_key, privacy_url = @privacy_url,
          active = @active, updated_at = @updated_at
        WHERE id = @id`,
      )
      .run({ ...row, id });
    const saved = getLeadForm(id);
    if (!saved) return { ok: false, error: "That form no longer exists." };
    return { ok: true, form: saved };
  }
  const created: LeadForm = { ...row, id: newId("lf"), created_at: now };
  getDb()
    .prepare(
      `INSERT INTO lead_forms (
        id, name, slug, lead_source, campaign, lead_source_who, allowed_domains, external_key, privacy_url, active, created_at, updated_at
      ) VALUES (
        @id, @name, @slug, @lead_source, @campaign, @lead_source_who, @allowed_domains, @external_key, @privacy_url, @active, @created_at, @updated_at
      )`,
    )
    .run(created);
  return { ok: true, form: created };
}

function uniqueSlug(base: string, ignoreId?: string) {
  let slug = base;
  let n = 2;
  for (;;) {
    const existing = getLeadFormBySlug(slug);
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base.slice(0, 54)}-${n++}`;
  }
}

export type SourceBadge = {
  label: string;
  campaign: string;
  callerNote: string;
};

export function listSourceBadges(personIds: string[]) {
  const map = new Map<string, SourceBadge>();
  if (personIds.length === 0) return map;
  const db = getDb();
  for (let index = 0; index < personIds.length; index += 100) {
    const chunk = personIds.slice(index, index + 100);
    const marks = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT person_id, intake_source, campaign, caller_name, resident_name
         FROM enquiry_intake WHERE person_id IN (${marks})`,
      )
      .all(...chunk) as {
      person_id: string;
      intake_source: string;
      campaign: string;
      caller_name: string;
      resident_name: string;
    }[];
    for (const row of rows) {
      const resident = row.resident_name.trim();
      const caller = row.caller_name.trim();
      map.set(row.person_id, {
        label: marketingSourceLabel(row.intake_source),
        campaign: row.campaign,
        callerNote: resident && caller && resident.toLowerCase() !== caller.toLowerCase() ? `Caller ${caller}` : "",
      });
    }
  }
  return map;
}

export function getSourceBadge(personId: string) {
  return listSourceBadges([personId]).get(personId) ?? null;
}

export function getEnquiryIntake(personId: string): EnquiryIntake | null {
  const row = getDb()
    .prepare(
      `SELECT i.*, COALESCE(f.name, '') AS form_name, COALESCE(f.slug, '') AS form_slug
       FROM enquiry_intake i
       LEFT JOIN lead_forms f ON f.id = i.form_id
       WHERE i.person_id = ?`,
    )
    .get(personId) as EnquiryIntake | undefined;
  return row ?? null;
}

export function listEnquiryTouches(personId: string): EnquiryTouch[] {
  return getDb()
    .prepare(`SELECT * FROM enquiry_touches WHERE person_id = ? ORDER BY created_at ASC, id ASC`)
    .all(personId) as EnquiryTouch[];
}

export type SourceReportRow = {
  month: string;
  source: string;
  sourceLabel: string;
  campaign: string;
  enquiries: number;
};

export function enquirySourceReport(month?: string): SourceReportRow[] {
  const rows = getDb()
    .prepare(
      `SELECT intake_source, campaign, created_at FROM enquiry_intake`,
    )
    .all() as { intake_source: string; campaign: string; created_at: string }[];
  const counts = new Map<string, SourceReportRow>();
  for (const row of rows) {
    const keyMonth = johannesburgMonth(row.created_at);
    if (month && month !== "all" && keyMonth !== month) continue;
    const campaign = row.campaign.trim() || "(none)";
    const id = `${keyMonth}|${row.intake_source}|${campaign}`;
    const current = counts.get(id);
    if (current) {
      current.enquiries += 1;
    } else {
      counts.set(id, {
        month: keyMonth,
        source: row.intake_source,
        sourceLabel: marketingSourceLabel(row.intake_source),
        campaign,
        enquiries: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => {
    if (a.month !== b.month) return a.month < b.month ? 1 : -1;
    if (a.enquiries !== b.enquiries) return b.enquiries - a.enquiries;
    return a.sourceLabel.localeCompare(b.sourceLabel);
  });
}

export function enquirySourceMonths() {
  const rows = getDb().prepare(`SELECT created_at FROM enquiry_intake`).all() as { created_at: string }[];
  return [...new Set(rows.map((row) => johannesburgMonth(row.created_at)))].sort().reverse();
}

function johannesburgMonth(iso: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
  return formatted.slice(0, 7);
}

export function countIntakesForForm(formId: string) {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM enquiry_intake WHERE form_id = ?`)
    .get(formId) as { n: number };
  return row.n;
}

type ParsedLead = {
  callerName: string;
  residentName: string;
  phone: string;
  email: string;
  country: string;
  preferredHouse: "" | "manor" | "lodge" | "unsure";
  message: string;
  popiaConsent: boolean;
  honeypot: string;
  turnstileToken: string;
  placement: "hosted" | "embed";
  parentHost: string;
  attribution: Attribution;
};

function parseHouse(value: string): ParsedLead["preferredHouse"] {
  const text = value.trim().toLowerCase();
  if (!text) return "";
  if (text === "manor" || text.includes("weltevreden")) return "manor";
  if (text === "lodge" || text.includes("liberty lodge")) return "lodge";
  if (text === "unsure" || text.includes("not sure") || text.includes("either")) return "unsure";
  return "";
}

function housePreference(value: ParsedLead["preferredHouse"]): House | "either" | "" {
  if (value === "manor" || value === "lodge") return value;
  if (value === "unsure") return "either";
  return "";
}

export function parsePublicFields(fields: Record<string, string>): ParsedLead {
  const consent = fields.popia_consent;
  return {
    callerName: clamp(fields.caller_name || "", 120),
    residentName: clamp(fields.resident_name || "", 120),
    phone: clamp(fields.phone || "", 40),
    email: clamp(fields.email || "", 200),
    country: clamp(fields.country || "", 80),
    preferredHouse: parseHouse(fields.preferred_house || ""),
    message: clamp(fields.message || "", 4000),
    popiaConsent: consent === "1" || consent === "on" || consent === "true",
    honeypot: fields.company_website || "",
    turnstileToken: clamp(fields["cf-turnstile-response"] || "", 2048),
    placement: fields.placement === "embed" ? "embed" : "hosted",
    parentHost: clamp(fields.parent_host || "", 2000),
    attribution: attributionFromRecord(fields),
  };
}

function validateParsed(parsed: ParsedLead, requireConsent: boolean): IntakeErrorCode | null {
  if (!parsed.callerName) return "name";
  if (parsed.email && !normalizeEmail(parsed.email)) return "email";
  if (parsed.phone && parsed.phone.replace(/\D/g, "").length < 7) return "phone";
  if (!normalizeEmail(parsed.email) && parsed.phone.replace(/\D/g, "").length < 7) return "contact";
  if (requireConsent && !parsed.popiaConsent) return "consent";
  return null;
}

function defaultAssigneeId() {
  const row = getDb()
    .prepare(`SELECT id FROM users WHERE role = 'admissions' ORDER BY name LIMIT 1`)
    .get() as { id: string } | undefined;
  return row?.id ?? "";
}

function notesFor(parsed: ParsedLead, sourceLabel: string, campaign: string, extra: string) {
  const lines = [parsed.message || "Enquiry from a lead form.", ""];
  lines.push(`Caller: ${parsed.callerName}`);
  if (parsed.residentName) lines.push(`Resident: ${parsed.residentName}`);
  if (parsed.country) lines.push(`Country: ${parsed.country}`);
  const house = preferredHouseLabel(parsed.preferredHouse);
  if (house) lines.push(`Preferred house: ${house}`);
  lines.push(`Source: ${sourceLabel}`);
  if (campaign) lines.push(`Campaign: ${campaign}`);
  if (extra) lines.push(extra);
  return lines.join("\n").slice(0, 8000);
}

function findRecentPersonId(phone: string, email: string, now: Date) {
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString();
  const key = phoneKey(phone);
  const normalized = normalizeEmail(email);
  if (!key && !normalized) return null;
  const db = getDb();
  const touch = db
    .prepare(
      `SELECT person_id, created_at FROM enquiry_touches
       WHERE created_at >= ?
         AND ((? != '' AND normalized_phone = ?) OR (? != '' AND normalized_email = ?))
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(since, key, key, normalized, normalized) as { person_id: string; created_at: string } | undefined;
  const people = db
    .prepare(
      `SELECT id, phone, email, created_at FROM people
       WHERE archived_at = '' AND created_at >= ?`,
    )
    .all(since) as { id: string; phone: string; email: string; created_at: string }[];
  let bestId = touch?.person_id ?? "";
  let bestAt = touch?.created_at ?? "";
  for (const person of people) {
    const phoneMatch = key !== "" && phoneKey(person.phone) === key;
    const emailMatch = normalized !== "" && person.email.trim().toLowerCase() === normalized;
    if (!phoneMatch && !emailMatch) continue;
    if (!bestAt || person.created_at > bestAt) {
      bestId = person.id;
      bestAt = person.created_at;
    }
  }
  return bestId || null;
}

function insertTouch(personId: string, formId: string, channel: string, parsed: ParsedLead, source: string, campaign: string, externalId: string, createdAt: string) {
  const touch: EnquiryTouch = {
    id: newId("lt"),
    person_id: personId,
    form_id: formId,
    channel,
    caller_name: parsed.callerName,
    resident_name: parsed.residentName,
    phone: parsed.phone,
    email: normalizeEmail(parsed.email),
    country: parsed.country,
    preferred_house: parsed.preferredHouse,
    message: parsed.message,
    intake_source: source,
    campaign,
    ...parsed.attribution,
    popia_consent: parsed.popiaConsent ? 1 : 0,
    external_id: externalId,
    created_at: createdAt,
  };
  getDb()
    .prepare(
      `INSERT INTO enquiry_touches (
        id, person_id, form_id, channel, caller_name, resident_name, phone, email,
        normalized_phone, normalized_email, country, preferred_house, message, intake_source, campaign,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid,
        referrer_url, landing_url, popia_consent, external_id, created_at
      ) VALUES (
        @id, @person_id, @form_id, @channel, @caller_name, @resident_name, @phone, @email,
        @normalized_phone, @normalized_email, @country, @preferred_house, @message, @intake_source, @campaign,
        @utm_source, @utm_medium, @utm_campaign, @utm_term, @utm_content, @gclid, @fbclid,
        @referrer_url, @landing_url, @popia_consent, @external_id, @created_at
      )`,
    )
    .run({
      ...touch,
      normalized_phone: phoneKey(parsed.phone),
      normalized_email: normalizeEmail(parsed.email),
    });
  return touch;
}

function insertIntake(personId: string, formId: string, channel: string, parsed: ParsedLead, source: string, campaign: string, createdAt: string) {
  getDb()
    .prepare(
      `INSERT INTO enquiry_intake (
        person_id, form_id, caller_name, resident_name, country, preferred_house, intake_source, campaign, message,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, referrer_url, landing_url,
        popia_consent, channel, created_at, updated_at
      ) VALUES (
        @person_id, @form_id, @caller_name, @resident_name, @country, @preferred_house, @intake_source, @campaign, @message,
        @utm_source, @utm_medium, @utm_campaign, @utm_term, @utm_content, @gclid, @fbclid, @referrer_url, @landing_url,
        @popia_consent, @channel, @created_at, @updated_at
      )`,
    )
    .run({
      person_id: personId,
      form_id: formId,
      caller_name: parsed.callerName,
      resident_name: parsed.residentName,
      country: parsed.country,
      preferred_house: parsed.preferredHouse,
      intake_source: source,
      campaign,
      message: parsed.message,
      ...parsed.attribution,
      popia_consent: parsed.popiaConsent ? 1 : 0,
      channel,
      created_at: createdAt,
      updated_at: createdAt,
    });
}

export function checkRateLimit(ip: string, bucket: string, limit = RATE_LIMIT.limit, windowMs = RATE_LIMIT.windowMs, now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const purgeBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM lead_form_hits WHERE created_at < ?`).run(purgeBefore);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM lead_form_hits WHERE ip = ? AND form_id = ? AND created_at >= ?`)
    .get(ip, bucket, cutoff) as { n: number };
  if (row.n >= limit) return false;
  db.prepare(`INSERT INTO lead_form_hits (id, ip, form_id, created_at) VALUES (?, ?, ?, ?)`).run(
    newId("hit"),
    ip.slice(0, 80) || "unknown",
    bucket,
    now.toISOString(),
  );
  return true;
}

function existingExternalId(externalId: string) {
  if (!externalId) return null;
  const row = getDb()
    .prepare(`SELECT person_id FROM enquiry_touches WHERE external_id = ?`)
    .get(externalId) as { person_id: string } | undefined;
  return row?.person_id ?? null;
}

export async function acceptPublicSubmission(input: {
  slug: string;
  fields: Record<string, string>;
  ip: string;
  appHost: string;
  now?: Date;
  verifyTurnstile?: (token: string, ip: string) => Promise<boolean>;
}): Promise<AcceptResult> {
  const form = getLeadFormBySlug(input.slug);
  if (!form || form.active !== 1) return { ok: false, code: "unavailable" };
  const now = input.now ?? new Date();
  if (!checkRateLimit(input.ip || "unknown", form.id, RATE_LIMIT.limit, RATE_LIMIT.windowMs, now)) {
    return { ok: false, code: "rate" };
  }
  const parsed = parsePublicFields(input.fields);
  if (parsed.honeypot.trim()) return { ok: true, dropped: true };
  if (parsed.placement === "embed" && !embedParentAllowed(parsed.parentHost, allowedHostsFor(form), input.appHost)) {
    return { ok: false, code: "embed" };
  }
  if (process.env.TURNSTILE_SECRET_KEY) {
    const passed = input.verifyTurnstile
      ? await input.verifyTurnstile(parsed.turnstileToken, input.ip)
      : await verifyTurnstileToken(parsed.turnstileToken, input.ip);
    if (!passed) return { ok: false, code: "turnstile" };
  }
  const invalid = validateParsed(parsed, true);
  if (invalid) return { ok: false, code: invalid };
  return storeLead({
    formId: form.id,
    source: form.lead_source,
    campaign: form.campaign,
    leadSourceWho: form.lead_source_who,
    channel: parsed.placement,
    parsed,
    externalId: "",
    now,
    extraNote: "",
  });
}

export function storeLead(input: {
  formId: string;
  source: MarketingLeadSource;
  campaign: string;
  leadSourceWho?: string;
  channel: string;
  parsed: ParsedLead;
  externalId: string;
  now?: Date;
  extraNote: string;
}): AcceptResult {
  const now = input.now ?? new Date();
  const duplicateId = existingExternalId(input.externalId);
  if (duplicateId) {
    return { ok: true, dropped: false, deduped: true, duplicate: true, personId: duplicateId };
  }
  const sourceLabel = marketingSourceLabel(input.source);
  const recentId = findRecentPersonId(input.parsed.phone, input.parsed.email, now);
  const createdAt = now.toISOString();
  try {
    if (recentId) {
      const db = getDb();
      const result = db.transaction(() => {
        insertTouch(recentId, input.formId, input.channel, input.parsed, input.source, input.campaign, input.externalId, createdAt);
        const current = db.prepare(`SELECT commercial_notes FROM people WHERE id = ?`).get(recentId) as
          | { commercial_notes: string }
          | undefined;
        const addition = [
          "",
          `Another lead form touch (${createdAt.slice(0, 16).replace("T", " ")} UTC) via ${sourceLabel}`,
          input.parsed.message ? input.parsed.message : "",
          input.extraNote,
        ]
          .filter(Boolean)
          .join("\n");
        const notes = `${current?.commercial_notes ?? ""}\n${addition}`.trim().slice(0, 8000);
        const patched = applyPersonPatch(
          recentId,
          { commercial_notes: notes },
          LEAD_INTAKE_ACTOR,
          "field_edit",
          `Another lead form touch — ${sourceLabel}`,
        );
        if (!patched.ok) throw new Error(patched.error);
        return recentId;
      })();
      return { ok: true, dropped: false, deduped: true, duplicate: false, personId: result };
    }

    const display = splitPersonName(input.parsed.residentName || input.parsed.callerName);
    const email = normalizeEmail(input.parsed.email);
    const assignee = defaultAssigneeId();
    const personId = getDb().transaction(() => {
      const { person } = createEnquiry(
        {
          first_name: display.first || "Enquiry",
          last_name: display.last || "—",
          email,
          phone: input.parsed.phone,
          lead_source: staffLeadSource(input.source),
          lead_source_note: input.campaign ? `${sourceLabel} · ${input.campaign}` : sourceLabel,
          lead_source_who: leadSourceNeedsWho(input.source) ? clamp(input.leadSourceWho ?? "", 160) : "",
          caller_name: input.parsed.callerName,
          resident_name: input.parsed.residentName,
          contact_method: email ? "email" : "phone",
          assigned_to_user_id: assignee,
          referral_owner_user_id: assignee,
          commercial_notes: notesFor(input.parsed, sourceLabel, input.campaign, input.extraNote),
          house_preference: housePreference(input.parsed.preferredHouse),
        },
        LEAD_INTAKE_ACTOR,
      );
      insertIntake(person.id, input.formId, input.channel, input.parsed, input.source, input.campaign, createdAt);
      insertTouch(person.id, input.formId, input.channel, input.parsed, input.source, input.campaign, input.externalId, createdAt);
      return person.id;
    })();
    return { ok: true, dropped: false, deduped: false, duplicate: false, personId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      const existing = existingExternalId(input.externalId);
      if (existing) return { ok: true, dropped: false, deduped: true, duplicate: true, personId: existing };
    }
    throw error;
  }
}

export function submitMappedLead(input: {
  source: MarketingLeadSource;
  campaign: string;
  leadSourceWho?: string;
  formId?: string;
  channel: string;
  callerName: string;
  residentName?: string;
  phone?: string;
  email?: string;
  country?: string;
  preferredHouse?: string;
  message?: string;
  consent: boolean;
  attribution?: Partial<Attribution>;
  externalId?: string;
  extraNote?: string;
  now?: Date;
}): AcceptResult {
  const fields: Record<string, string> = {
    caller_name: input.callerName,
    resident_name: input.residentName ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    country: input.country ?? "",
    preferred_house: input.preferredHouse ?? "",
    message: input.message ?? "",
    popia_consent: input.consent ? "1" : "",
    placement: "hosted",
  };
  for (const key of ATTRIBUTION_KEYS) fields[key] = input.attribution?.[key] ?? "";
  const parsed = parsePublicFields(fields);
  if (!parsed.callerName) parsed.callerName = input.channel === "google" ? "Google lead" : "Meta lead";
  return storeLead({
    formId: input.formId ?? "",
    source: input.source,
    campaign: input.campaign,
    leadSourceWho: input.leadSourceWho,
    channel: input.channel,
    parsed,
    externalId: (input.externalId ?? "").slice(0, 200),
    now: input.now,
    extraNote: input.extraNote ?? "",
  });
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function mapHouseText(value: string) {
  return parseHouse(value);
}
