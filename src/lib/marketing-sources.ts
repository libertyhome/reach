import { LEAD_SOURCES, type LeadSource } from "./types";

/**
 * Marketing lead sources for forms and webhooks.
 * The staff enquiry form's LEAD_SOURCES list is being replaced in a separate PR
 * (caller name, resident name, and this same source list). This file is the
 * form builder's source of truth. legacyLeadSource() maps onto today's enum
 * so existing cards still save, and falls back to whatever that enum contains
 * if the other PR changes it first.
 */
export const MARKETING_LEAD_SOURCES = [
  { slug: "recovery_com", label: "Recovery.com", legacy: "website" },
  { slug: "returning_client", label: "Returning Client", legacy: "other" },
  { slug: "ex_resident", label: "Ex-resident", legacy: "other" },
  { slug: "google_com", label: "Google.com", legacy: "website" },
  { slug: "google_nl", label: "Google.nl", legacy: "website" },
  { slug: "google_be", label: "Google.be", legacy: "website" },
  { slug: "meta_ads", label: "Meta ads", legacy: "website" },
  { slug: "google_ad_words", label: "Google ad words", legacy: "website" },
  { slug: "recovery_coach", label: "Recovery Coach", legacy: "referral_partner" },
  { slug: "referrer", label: "Referrer", legacy: "referral_partner" },
  { slug: "personal_contact", label: "Personal Contact", legacy: "family" },
] as const;

export type MarketingLeadSource = (typeof MARKETING_LEAD_SOURCES)[number]["slug"];

const LEGACY_BY_SLUG = Object.fromEntries(
  MARKETING_LEAD_SOURCES.map((source) => [source.slug, source.legacy]),
) as Record<MarketingLeadSource, string>;

export function isMarketingLeadSource(value: string): value is MarketingLeadSource {
  return Object.prototype.hasOwnProperty.call(LEGACY_BY_SLUG, value);
}

export function marketingSourceLabel(source: string) {
  return MARKETING_LEAD_SOURCES.find((item) => item.slug === source)?.label ?? source;
}

/** Map a marketing source onto the staff lead_source column without assuming the other PR has landed. */
export function legacyLeadSource(source: string): LeadSource {
  const preferred = isMarketingLeadSource(source) ? LEGACY_BY_SLUG[source] : "other";
  const values = LEAD_SOURCES as readonly string[];
  if (values.includes(preferred)) return preferred as LeadSource;
  return LEAD_SOURCES[0];
}
