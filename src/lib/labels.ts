import { bedCapacity } from "./houses";
import {
  ADMISSION_KIND_LABEL,
  ALL_LEAD_SOURCES,
  LEAD_SOURCES,
  LEGACY_LEAD_SOURCES,
  NOT_CONVERTED_REASONS,
  type AdmissionKind,
  type House,
  type LeadSource,
  type NotConvertedReason,
  type Role,
  type Stage,
} from "./types";

export const STAGE_NAV: { href: string; label: string; stage?: Stage }[] = [
  { href: "/enquiries", label: "Enquiries", stage: "enquiry" },
  { href: "/next-steps", label: "Next Steps", stage: "next_steps" },
  { href: "/approval", label: "Account and Clinical Approval", stage: "approval" },
  { href: "/admit", label: "Admit", stage: "admit" },
  { href: "/admitted", label: "Admitted" },
  { href: "/not-admitted", label: "Not admitted" },
  { href: "/manor", label: "Manor (22)" },
  { href: "/lodge", label: "Lodge (16)" },
];

/** Finance / Admin boards — commercial ops, separate from pipeline. */
export const FINANCE_NAV: { href: string; label: string }[] = [
  { href: "/accounts", label: "Accounts" },
  { href: "/dutch-insurance", label: "Dutch Insurance" },
  { href: "/sa-medical-aid", label: "SA Medical Aid" },
  { href: "/visa", label: "Visa" },
  { href: "/invoices", label: "Invoices" },
];

export const STAGE_LABEL: Record<Stage, string> = {
  enquiry: "Enquiries",
  next_steps: "Next Steps",
  approval: "Account and Clinical Approval",
  admit: "Admit",
  resident: "Resident",
  archived: "Archived",
};

export const HOUSE_LABEL: Record<House, string> = {
  manor: "Weltevreden Manor",
  lodge: "Liberty Lodge",
};

export const HOUSE_SHORT: Record<House, string> = {
  manor: "Manor",
  lodge: "Lodge",
};

export const HOUSE_CAPACITY: Record<House, number> = {
  manor: bedCapacity("manor"),
  lodge: bedCapacity("lodge"),
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  recovery_com: "Recovery.com",
  returning_client: "Returning Client",
  ex_resident: "Ex-resident",
  google_com: "Google.com",
  google_nl: "Google.nl",
  google_be: "Google.be",
  meta_ads: "Meta ads",
  google_adwords: "Google ad words",
  recovery_coach: "Recovery Coach",
  referrer: "Referrer",
  personal_contact: "Personal Contact",
  family: "Family",
  self: "Self",
  gp: "GP",
  website: "Website",
  referral_partner: "Referral partner",
  other: "Other",
};

export const NOT_CONVERTED_REASON_LABEL: Record<NotConvertedReason, string> = {
  location_mismatch: "Location Mismatch",
  chose_competitor: "Chose Competitor",
  affordability_above_budget: "Affordability issue – Above budget",
  affordability_copayment: "Affordability – Co-payment",
  unresponsive: "Unresponsive",
  unsuitability_adolescent: "Unsuitability – Adolescent",
  clinical_unsuitability: "Clinical Unsuitability",
};

export function isLeadSource(value: string): value is LeadSource {
  return (ALL_LEAD_SOURCES as readonly string[]).includes(value);
}

export function isCurrentLeadSource(value: string): value is (typeof LEAD_SOURCES)[number] {
  return (LEAD_SOURCES as readonly string[]).includes(value);
}

export function isNotConvertedReason(value: string): value is NotConvertedReason {
  return (NOT_CONVERTED_REASONS as readonly string[]).includes(value);
}

export function leadSourceLabel(source: string) {
  return isLeadSource(source) ? LEAD_SOURCE_LABEL[source] : source;
}

export function notConvertedReasonLabel(reason: string) {
  return isNotConvertedReason(reason) ? NOT_CONVERTED_REASON_LABEL[reason] : reason;
}

/** New sources, plus the saved legacy value so an old enquiry is not rewritten on save. */
export function leadSourceOptions(current: string): LeadSource[] {
  if ((LEGACY_LEAD_SOURCES as readonly string[]).includes(current)) {
    return [current as LeadSource, ...LEAD_SOURCES];
  }
  return [...LEAD_SOURCES];
}

export const ROLE_LABEL: Record<Role, string> = {
  therapist: "Therapist",
  admissions: "Admissions",
  accounts: "Accounts",
  finance: "Finance",
  executive: "Executive",
};

export const PIPELINE_STAGES: Stage[] = ["enquiry", "next_steps", "approval", "admit"];

/** Staff-facing admission line, including optional detox-first on a treatment admit. */
export function admissionSummary(person: {
  admission_kind: AdmissionKind | "";
  detox_first?: number;
  expected_detox_nights?: number;
}) {
  if (person.admission_kind === "detox_containment") return ADMISSION_KIND_LABEL.detox_containment;
  if (person.admission_kind !== "program") return "";
  if (person.detox_first === 1) {
    const days = person.expected_detox_nights ?? 0;
    const noun = days === 1 ? "day" : "days";
    return `${ADMISSION_KIND_LABEL.program} · detox first, ${days} ${noun}`;
  }
  return ADMISSION_KIND_LABEL.program;
}

export function personDisplayName(person: {
  first_name: string;
  last_name: string;
  preferred_name: string;
}) {
  const full = `${person.first_name} ${person.last_name}`.trim();
  if (person.preferred_name && person.preferred_name !== person.first_name) {
    return `${full} (${person.preferred_name})`;
  }
  return full;
}

export function initials(person: { first_name: string; last_name: string }) {
  return `${person.first_name.slice(0, 1)}${person.last_name.slice(0, 1)}`.toUpperCase();
}
