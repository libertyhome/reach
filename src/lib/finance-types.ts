import type { Currency, House } from "./types";

export const ACCOUNT_GROUPS = [
  "new_admissions",
  "phase_1",
  "phase_2",
  "phase_3",
  "discharged",
] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string> = {
  new_admissions: "New Admissions",
  phase_1: "Phase 1",
  phase_2: "Phase 2",
  phase_3: "Phase 3",
  discharged: "Discharged",
};

export const INVOICE_STATUSES = ["none", "pending", "sent", "overdue", "paid", "renewed"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  none: "None",
  pending: "Pending",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  renewed: "Renewed",
};

export const INVOICE_REQUEST_STATUSES = ["pending", "sent", "done", "failed"] as const;
export type InvoiceRequestStatus = (typeof INVOICE_REQUEST_STATUSES)[number];

export const PAYMENT_INVOICE_STATUSES = ["draft", "pending", "sent", "due", "paid", "cancelled"] as const;
export type PaymentInvoiceStatus = (typeof PAYMENT_INVOICE_STATUSES)[number];

export const DUTCH_PROCESS_STAGES = [
  "intake",
  "submitted",
  "awaiting",
  "approved",
  "appealed",
  "declined",
  "closed",
] as const;
export type DutchProcessStage = (typeof DUTCH_PROCESS_STAGES)[number];

export const DUTCH_PROCESS_LABEL: Record<DutchProcessStage, string> = {
  intake: "Intake",
  submitted: "Submitted",
  awaiting: "Awaiting decision",
  approved: "Approved",
  appealed: "Appeal",
  declined: "Declined",
  closed: "Closed",
};

export const SA_AUTH_STATUSES = ["pending", "submitted", "authorised", "partial", "declined"] as const;
export type SaAuthStatus = (typeof SA_AUTH_STATUSES)[number];

export const SA_AUTH_LABEL: Record<SaAuthStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  authorised: "Authorised",
  partial: "Partial",
  declined: "Declined",
};

export const SA_MOTIVATION_STATUSES = ["not_started", "drafting", "submitted", "accepted"] as const;
export type SaMotivationStatus = (typeof SA_MOTIVATION_STATUSES)[number];

export const SA_MOTIVATION_LABEL: Record<SaMotivationStatus, string> = {
  not_started: "Not started",
  drafting: "Drafting",
  submitted: "Submitted",
  accepted: "Accepted",
};

export const VISA_TYPES = ["medical", "tourist"] as const;
export type VisaType = (typeof VISA_TYPES)[number];

export type AccountBilling = {
  id: string;
  person_id: string;
  account_group: AccountGroup;
  rate_amount: number;
  rate_currency: Currency;
  arf_sent: number;
  arp_name: string;
  amount_paid: number;
  total_amount: number;
  percent_paid: number;
  last_invoice_date: string;
  next_invoice_date: string;
  invoice_status: InvoiceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type AccountRow = AccountBilling & {
  first_name: string;
  last_name: string;
  preferred_name: string;
  house: House | "";
  admission_date: string;
  planned_discharge_date: string;
  admitted_at: string;
  room_privacy: string;
  arf_signed: number;
  arp_signed: number;
  manor_phase: string;
  transfer_extension_status: string;
  stage: string;
};

export type InvoiceRequest = {
  id: string;
  person_id: string;
  client_name: string;
  facility: string;
  phase: string;
  amount_hint: number;
  currency: Currency;
  notes: string;
  requested_by: string;
  requested_at: string;
  status: InvoiceRequestStatus;
  invoice_id: string;
  created_at: string;
  updated_at: string;
};

export type PaymentInvoice = {
  id: string;
  person_id: string;
  insurance_ref: string;
  invoice_number: string;
  amount: number;
  currency: Currency;
  sent_date: string;
  due_date: string;
  paid_date: string;
  status: PaymentInvoiceStatus;
  source_request_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type PaymentInvoiceRow = PaymentInvoice & {
  client_name: string;
  facility: string;
};

export type DutchInsurer = {
  id: string;
  name: string;
  submission_email: string;
  submission_method: string;
  digid_notes: string;
  turnaround_days: number;
  notes: string;
};

export type DutchInsuranceApp = {
  id: string;
  person_id: string;
  insurer_id: string;
  insurer_name: string;
  process_stage: DutchProcessStage;
  submitted_date: string;
  approval_amount: number;
  currency: Currency;
  extension_flag: number;
  appeal_flag: number;
  linked_invoice_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DutchInsuranceRow = DutchInsuranceApp & {
  first_name: string;
  last_name: string;
  preferred_name: string;
  house: House | "";
};

export type SaScheme = {
  id: string;
  name: string;
  portal_url: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
};

export type SaMedicalAidApp = {
  id: string;
  person_id: string;
  scheme_id: string;
  scheme_name: string;
  auth_status: SaAuthStatus;
  pmb: number;
  co_pay_amount: number;
  clinical_motivation_status: SaMotivationStatus;
  submitted_date: string;
  approved_amount: number;
  currency: Currency;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SaMedicalAidRow = SaMedicalAidApp & {
  first_name: string;
  last_name: string;
  preferred_name: string;
  house: House | "";
};

export type VisaApplication = {
  id: string;
  person_id: string;
  facility: House | "";
  passport_expiry: string;
  visa_type: VisaType;
  visa_expiry: string;
  vfs_status: string;
  extension_status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type VisaRow = VisaApplication & {
  first_name: string;
  last_name: string;
  preferred_name: string;
};

export type FinanceEvent = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  summary: string;
  actor_id: string;
  before_json: string;
  after_json: string;
  undone: number;
  undone_at: string;
  created_at: string;
};
