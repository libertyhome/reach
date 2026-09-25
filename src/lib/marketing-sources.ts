import { leadSourceLabel, isCurrentLeadSource } from "./labels";
import { LEAD_SOURCES, LEAD_SOURCES_WITH_WHO, type LeadSource } from "./types";

/**
 * Form-builder sources are the current enquiry sources from #6.
 * Labels and slugs come from LEAD_SOURCES so the badge and the staff form agree.
 */
export const MARKETING_LEAD_SOURCES = LEAD_SOURCES.map((slug) => ({
  slug,
  label: leadSourceLabel(slug),
}));

export type MarketingLeadSource = (typeof LEAD_SOURCES)[number];

/** Earlier drafts stored this slug. Read it as the current Google Ads source. */
const SOURCE_ALIASES: Record<string, MarketingLeadSource> = {
  google_ad_words: "google_adwords",
};

export function canonicalLeadSource(value: string): MarketingLeadSource | null {
  if (isCurrentLeadSource(value)) return value;
  return SOURCE_ALIASES[value] ?? null;
}

export function isMarketingLeadSource(value: string): value is MarketingLeadSource {
  return canonicalLeadSource(value) != null;
}

export function leadSourceNeedsWho(source: string) {
  const canonical = canonicalLeadSource(source);
  return canonical != null && (LEAD_SOURCES_WITH_WHO as readonly string[]).includes(canonical);
}

export function marketingSourceLabel(source: string) {
  const canonical = canonicalLeadSource(source);
  return canonical ? leadSourceLabel(canonical) : source;
}

/** Staff lead_source value for a form source. Current sources are stored as themselves. */
export function staffLeadSource(source: string): LeadSource {
  return canonicalLeadSource(source) ?? "other";
}
