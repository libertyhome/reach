export const ROLES = ["therapist", "admissions", "accounts", "finance", "executive"] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = [
  "enquiry",
  "next_steps",
  "approval",
  "admit",
  "resident",
  "archived",
] as const;
export type Stage = (typeof STAGES)[number];

export const HOUSES = ["manor", "lodge"] as const;
export type House = (typeof HOUSES)[number];

export const LEAD_SOURCES = [
  "family",
  "self",
  "gp",
  "website",
  "referral_partner",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const FUNDING_TYPES = ["private", "medical_aid", "sponsor", "other"] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

export const CURRENCIES = ["ZAR", "EUR", "GBP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CONTACT_METHODS = ["phone", "whatsapp", "email", "walk_in", "other"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const HANDOFF_STATUSES = ["none", "stub_ready", "stub_sent", "pack_ready"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

/**
 * Wire values stay stable for the Within handoff.
 * `program` is Treatment. `detox_containment` is Short stay (detox-only / brief).
 * Detox then programme is Treatment plus detox_first — not a third kind.
 */
export const ADMISSION_KINDS = ["program", "detox_containment"] as const;
export type AdmissionKind = (typeof ADMISSION_KINDS)[number];

export const ADMISSION_KIND_LABEL: Record<AdmissionKind, string> = {
  program: "Treatment",
  detox_containment: "Short stay",
};

/**
 * Detox days (1–5) when Treatment starts with the Detox commercial add-on.
 * Stored as expected_detox_nights and sent on the Within handoff as expectedDetoxNights.
 */
export const EXPECTED_DETOX_NIGHTS = [1, 2, 3, 4, 5] as const;
export type ExpectedDetoxNights = (typeof EXPECTED_DETOX_NIGHTS)[number];

/** Manor program phase at admit. Lodge is always Phase 3 (sober living). */
export const MANOR_PHASES = ["1", "2"] as const;
export type ManorPhase = (typeof MANOR_PHASES)[number];

export const PROGRAM_PHASES = ["1", "2", "3"] as const;
export type ProgramPhase = (typeof PROGRAM_PHASES)[number];

export const ROOM_PRIVACIES = ["", "shared", "private"] as const;
export type RoomPrivacy = (typeof ROOM_PRIVACIES)[number];

export const TRANSFER_EXTENSION_STATUSES = [
  "",
  "none",
  "transfer_requested",
  "extension_requested",
  "in_progress",
  "completed",
] as const;
export type TransferExtensionStatus = (typeof TRANSFER_EXTENSION_STATUSES)[number];

export const DOCUMENT_KINDS = ["discharge_report", "clinical_report", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const AUDIT_ACTIONS = [
  "create",
  "stage_move",
  "field_edit",
  "lead_source",
  "house_assignment",
  "archive",
  "admit",
  "undo",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
};

export type Room = {
  id: string;
  house: House;
  name: string;
  sort_order: number;
};

export type Person = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  enquiry_date: string;
  lead_source: LeadSource;
  lead_source_note: string;
  contact_method: ContactMethod | "";
  assigned_to_user_id: string;
  counsellor_user_id: string;
  referral_owner_user_id: string;
  referrer_name: string;
  referrer_contact_person: string;
  referrer_phone: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  funding_type: FundingType;
  funding_notes: string;
  currency: Currency;
  expected_arrival: string;
  admission_date: string;
  planned_discharge_date: string;
  house_preference: House | "either" | "";
  preferred_room_id: string;
  commercial_notes: string;
  assessment_details: string;
  assessment_notes: string;
  stage: Stage;
  house: House | "";
  room_id: string;
  room_privacy: RoomPrivacy;
  manor_phase: ManorPhase | "";
  accounts_approved: number;
  clinical_approved: number;
  deposit_received: number;
  arp_signed: number;
  arf_signed: number;
  funding_confirmed: number;
  admission_date_agreed: number;
  room_offered: number;
  addon_medical_float: number;
  addon_nursing_medical_admission: number;
  addon_psych_admission: number;
  addon_overnight_supervision: number;
  transfer_extension_status: TransferExtensionStatus;
  transfer_extension_notes: string;
  within_handoff_status: HandoffStatus;
  within_client_id: string;
  admission_kind: AdmissionKind | "";
  /** 1 when the Detox commercial add-on is on. Treatment then continues on this admission. */
  detox_first: number;
  /** 1–5 days when detox_first is 1; otherwise 0. Same count is sent to Within. */
  expected_detox_nights: number;
  admitted_at: string;
  archived_at: string;
  created_at: string;
  updated_at: string;
};

export type PersonDocument = {
  id: string;
  person_id: string;
  kind: DocumentKind;
  title: string;
  filename: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  for_within: number;
  uploaded_by: string;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  entity_type: "person";
  entity_id: string;
  action: AuditAction;
  summary: string;
  actor_id: string;
  before_json: string;
  after_json: string;
  undone: number;
  undone_at: string;
  undo_of: string;
  created_at: string;
};

export type PersonSnapshot = Person;

export const COMMERCIAL_CHECKLIST = [
  {
    key: "deposit_received",
    label: "Deposit received",
    roleHint: "Accounts",
    help: "Invoice paid / deposit landed.",
  },
  {
    key: "arp_signed",
    label: "ARP signed",
    roleHint: "Accounts",
    help: "Account-responsible person signed the commercial paperwork.",
  },
  {
    key: "accounts_approved",
    label: "Accounts approved",
    roleHint: "Accounts",
    help: "Tick on full payment / accounts clear.",
  },
  {
    key: "funding_confirmed",
    label: "Funding confirmed",
    roleHint: "Admissions",
    help: "Admissions ticks after Accounts approved.",
  },
  {
    key: "clinical_approved",
    label: "Clinical approval recorded (gate only)",
    roleHint: "Admissions",
    help: "Gate only — clinical detail stays in Within.",
  },
  {
    key: "arf_signed",
    label: "ARF signed",
    roleHint: "Admissions",
    help: "Commercial gate that the ARF was signed in Within (PDF signing is not stored here).",
  },
  {
    key: "admission_date_agreed",
    label: "Admission date agreed",
    roleHint: "Admissions",
    help: "Arrival date agreed with family / referrer.",
  },
  {
    key: "room_offered",
    label: "Room offered",
    roleHint: "Admissions",
    help: "A house and room have been offered.",
  },
] as const;

export type ChecklistKey = (typeof COMMERCIAL_CHECKLIST)[number]["key"];

/** Boolean commercial add-ons. Detox is separate: it also records a 1–5 day count. */
export const COMMERCIAL_ADDONS = [
  { key: "addon_medical_float", label: "Medical float" },
  { key: "addon_nursing_medical_admission", label: "Nursing & medical admission" },
  { key: "addon_psych_admission", label: "Psych admission" },
  { key: "addon_overnight_supervision", label: "Overnight supervision" },
] as const;

export type AddonKey = (typeof COMMERCIAL_ADDONS)[number]["key"];

export const TRANSFER_EXTENSION_LABEL: Record<Exclude<TransferExtensionStatus, "">, string> = {
  none: "None",
  transfer_requested: "Transfer requested",
  extension_requested: "Extension requested",
  in_progress: "In progress",
  completed: "Completed",
};

export const ROOM_PRIVACY_LABEL: Record<"shared" | "private", string> = {
  shared: "Shared",
  private: "Private",
};

export const CONTACT_METHOD_LABEL: Record<ContactMethod, string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  walk_in: "Walk-in",
  other: "Other",
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  discharge_report: "Discharge report",
  clinical_report: "Clinical report",
  other: "Other document",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  ZAR: "ZAR (South African rand)",
  EUR: "EUR (Euro)",
  GBP: "GBP (Pound sterling)",
  USD: "USD (US dollar)",
};
