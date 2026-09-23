import { ADMISSION_KIND_LABEL, type AdmissionKind, type House, type LeadSource, type Role, type Stage } from "./types";

export const STAGE_NAV: { href: string; label: string; stage?: Stage }[] = [
  { href: "/enquiries", label: "Enquiries", stage: "enquiry" },
  { href: "/next-steps", label: "Next Steps", stage: "next_steps" },
  { href: "/approval", label: "Account and Clinical Approval", stage: "approval" },
  { href: "/admit", label: "Admit", stage: "admit" },
  { href: "/manor", label: "Manor (21)" },
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
  manor: 21,
  lodge: 16,
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  family: "Family",
  self: "Self",
  gp: "GP",
  website: "Website",
  referral_partner: "Referral partner",
  other: "Other",
};

export const ROLE_LABEL: Record<Role, string> = {
  therapist: "Therapist",
  admissions: "Admissions",
  accounts: "Accounts",
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
