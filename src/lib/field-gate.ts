/**
 * Reach is commercial CRM only. Clinical record stays in Within.
 * This gate lists writable commercial fields and rejects clinical / SoR keys.
 */

export const COMMERCIAL_FIELDS = [
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "phone",
  "enquiry_date",
  "lead_source",
  "lead_source_note",
  "contact_method",
  "assigned_to_user_id",
  "counsellor_user_id",
  "referral_owner_user_id",
  "referrer_name",
  "referrer_contact_person",
  "referrer_phone",
  "next_of_kin_name",
  "next_of_kin_phone",
  "funding_type",
  "funding_notes",
  "currency",
  "expected_arrival",
  "admission_date",
  "planned_discharge_date",
  "house_preference",
  "preferred_room_id",
  "commercial_notes",
  "assessment_details",
  "assessment_notes",
  "stage",
  "house",
  "room_id",
  "room_privacy",
  "manor_phase",
  "accounts_approved",
  "clinical_approved",
  "deposit_received",
  "arp_signed",
  "arf_signed",
  "funding_confirmed",
  "admission_date_agreed",
  "room_offered",
  "addon_medical_float",
  "addon_nursing_medical_admission",
  "addon_psych_admission",
  "addon_overnight_supervision",
  "transfer_extension_status",
  "transfer_extension_notes",
  "within_handoff_status",
  "within_client_id",
  "admission_kind",
  "detox_first",
  "expected_detox_nights",
  "within_waiting_status",
  "within_sent_at",
  "within_sent_by_name",
  "within_sent_by_user_id",
  "within_waiting_id",
  "admitted_at",
  "archived_at",
] as const;

export type CommercialField = (typeof COMMERCIAL_FIELDS)[number];

/** Clinical / SoR keys that must never be written as people columns in Reach. */
export const FORBIDDEN_CLINICAL_FIELDS = [
  "form_7",
  "form7",
  "medication",
  "medications",
  "meds",
  "therapy_notes",
  "session_notes",
  "clinical_sor",
  "sor",
  "statement_of_reasons",
  "diagnosis",
  "diagnoses",
  "vitals",
  "bpsa",
  "nursing_notes",
  "nursing_admission",
  "drug_of_choice",
  "itp",
  "mdt_notes",
  "relapse_plan",
  "discharge_report",
  "prescription",
] as const;

const COMMERCIAL_SET = new Set<string>(COMMERCIAL_FIELDS);
const FORBIDDEN_SET = new Set<string>(FORBIDDEN_CLINICAL_FIELDS);

export function isCommercialField(key: string): key is CommercialField {
  return COMMERCIAL_SET.has(key);
}

export function isForbiddenClinicalField(key: string) {
  return FORBIDDEN_SET.has(key.toLowerCase());
}

export function assertCommercialPatch(patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  const forbidden = keys.filter(isForbiddenClinicalField);
  if (forbidden.length > 0) {
    throw new Error(`Reach cannot store clinical fields: ${forbidden.join(", ")}. Use Within.`);
  }
  const unknown = keys.filter((key) => !isCommercialField(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown or blocked fields: ${unknown.join(", ")}`);
  }
}

/** Lead source is a property. Changing it must not move stage or archive. */
export const LEAD_SOURCE_SAFE_FIELDS = ["lead_source", "lead_source_note"] as const;
