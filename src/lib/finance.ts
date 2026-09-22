import { getDb } from "./db";
import type {
  AccountBilling,
  AccountGroup,
  AccountRow,
  DutchInsuranceApp,
  DutchInsuranceRow,
  DutchInsurer,
  FinanceEvent,
  InvoiceRequest,
  InvoiceRequestStatus,
  InvoiceStatus,
  PaymentInvoice,
  PaymentInvoiceRow,
  SaMedicalAidApp,
  SaMedicalAidRow,
  SaScheme,
  VisaApplication,
  VisaRow,
} from "./finance-types";
import { personDisplayName } from "./labels";
import { newId } from "./passwords";
import { getPerson } from "./people";
import type { Currency, User } from "./types";

function nowIso() {
  return new Date().toISOString();
}

export function listAccountRows(group?: AccountGroup | "all"): AccountRow[] {
  const sql =
    group && group !== "all"
      ? `SELECT b.*, p.first_name, p.last_name, p.preferred_name, p.house, p.admission_date,
                p.planned_discharge_date, p.admitted_at, p.room_privacy, p.arf_signed, p.arp_signed,
                p.manor_phase, p.transfer_extension_status, p.stage
         FROM account_billing b
         JOIN people p ON p.id = b.person_id
         WHERE b.account_group = ?
         ORDER BY b.next_invoice_date ASC, p.last_name ASC`
      : `SELECT b.*, p.first_name, p.last_name, p.preferred_name, p.house, p.admission_date,
                p.planned_discharge_date, p.admitted_at, p.room_privacy, p.arf_signed, p.arp_signed,
                p.manor_phase, p.transfer_extension_status, p.stage
         FROM account_billing b
         JOIN people p ON p.id = b.person_id
         ORDER BY b.next_invoice_date ASC, p.last_name ASC`;
  return group && group !== "all"
    ? (getDb().prepare(sql).all(group) as AccountRow[])
    : (getDb().prepare(sql).all() as AccountRow[]);
}

export function getAccountBilling(personId: string): AccountBilling | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM account_billing WHERE person_id = ?`)
      .get(personId) as AccountBilling | undefined) ?? null
  );
}

export function upsertAccountBilling(row: AccountBilling) {
  getDb()
    .prepare(
      `INSERT INTO account_billing (
        id, person_id, account_group, rate_amount, rate_currency, arf_sent, arp_name,
        amount_paid, total_amount, percent_paid, last_invoice_date, next_invoice_date,
        invoice_status, notes, created_at, updated_at
      ) VALUES (
        @id, @person_id, @account_group, @rate_amount, @rate_currency, @arf_sent, @arp_name,
        @amount_paid, @total_amount, @percent_paid, @last_invoice_date, @next_invoice_date,
        @invoice_status, @notes, @created_at, @updated_at
      )
      ON CONFLICT(person_id) DO UPDATE SET
        account_group = excluded.account_group,
        rate_amount = excluded.rate_amount,
        rate_currency = excluded.rate_currency,
        arf_sent = excluded.arf_sent,
        arp_name = excluded.arp_name,
        amount_paid = excluded.amount_paid,
        total_amount = excluded.total_amount,
        percent_paid = excluded.percent_paid,
        last_invoice_date = excluded.last_invoice_date,
        next_invoice_date = excluded.next_invoice_date,
        invoice_status = excluded.invoice_status,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(row);
  return row;
}

/** Clients whose next invoice is overdue or within the given horizon (days). */
export function listRenewals(withinDays = 14): AccountRow[] {
  const rows = listAccountRows("all").filter((row) => row.account_group !== "discharged");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return rows
    .filter((row) => {
      if (!row.next_invoice_date) return false;
      const next = new Date(`${row.next_invoice_date}T00:00:00.000Z`);
      const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= withinDays;
    })
    .sort((a, b) => a.next_invoice_date.localeCompare(b.next_invoice_date));
}

export function daysUntil(dateIso: string): number | null {
  if (!dateIso) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${dateIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function writeFinanceEvent(input: {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  actorId: string;
  before: unknown;
  after: unknown;
}) {
  const event: FinanceEvent = {
    id: newId("fev"),
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    summary: input.summary,
    actor_id: input.actorId,
    before_json: JSON.stringify(input.before),
    after_json: JSON.stringify(input.after),
    undone: 0,
    undone_at: "",
    created_at: nowIso(),
  };
  getDb()
    .prepare(
      `INSERT INTO finance_events (
        id, entity_type, entity_id, action, summary, actor_id,
        before_json, after_json, undone, undone_at, created_at
      ) VALUES (
        @id, @entity_type, @entity_id, @action, @summary, @actor_id,
        @before_json, @after_json, @undone, @undone_at, @created_at
      )`,
    )
    .run(event);
  return event;
}

export function getFinanceEvent(id: string): FinanceEvent | null {
  return (
    (getDb().prepare(`SELECT * FROM finance_events WHERE id = ?`).get(id) as FinanceEvent | undefined) ??
    null
  );
}

export function updateAccountInvoiceStatus(
  personId: string,
  status: InvoiceStatus,
  actor: User,
  summary: string,
) {
  const before = getAccountBilling(personId);
  if (!before) return { ok: false as const, error: "Account billing row not found" };
  const after: AccountBilling = {
    ...before,
    invoice_status: status,
    updated_at: nowIso(),
    ...(status === "renewed"
      ? {
          last_invoice_date: before.next_invoice_date || before.last_invoice_date,
          next_invoice_date: shiftDate(before.next_invoice_date || todayDate(), 28),
        }
      : {}),
  };
  upsertAccountBilling(after);
  const event = writeFinanceEvent({
    entityType: "account_billing",
    entityId: before.id,
    action: "invoice_status",
    summary,
    actorId: actor.id,
    before,
    after,
  });
  return { ok: true as const, billing: after, event };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(isoDate: string, days: number) {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function undoFinanceEvent(eventId: string, actorId: string) {
  const event = getFinanceEvent(eventId);
  if (!event || event.undone) return { ok: false as const, error: "Nothing to undo" };
  if (event.entity_type === "account_billing") {
    const before = JSON.parse(event.before_json) as AccountBilling;
    upsertAccountBilling(before);
  } else if (event.entity_type === "invoice_request") {
    // undo raise = mark request failed and cancel linked pending invoice
    const before = JSON.parse(event.before_json) as InvoiceRequest | null;
    const after = JSON.parse(event.after_json) as { request: InvoiceRequest; invoice: PaymentInvoice };
    if (before) {
      replaceInvoiceRequest(before);
    } else {
      getDb().prepare(`DELETE FROM invoice_requests WHERE id = ?`).run(after.request.id);
    }
    if (after.invoice?.id) {
      getDb().prepare(`DELETE FROM invoices WHERE id = ? AND status = 'pending'`).run(after.invoice.id);
    }
  } else {
    return { ok: false as const, error: "Unsupported undo" };
  }
  getDb()
    .prepare(`UPDATE finance_events SET undone = 1, undone_at = ? WHERE id = ?`)
    .run(nowIso(), eventId);
  writeFinanceEvent({
    entityType: event.entity_type,
    entityId: event.entity_id,
    action: "undo",
    summary: `Undo: ${event.summary}`,
    actorId,
    before: JSON.parse(event.after_json),
    after: JSON.parse(event.before_json),
  });
  return { ok: true as const, event };
}

export function listDutchInsurers(): DutchInsurer[] {
  return getDb().prepare(`SELECT * FROM dutch_insurers ORDER BY name ASC`).all() as DutchInsurer[];
}

export function listDutchInsuranceApps(): DutchInsuranceRow[] {
  return getDb()
    .prepare(
      `SELECT a.*, p.first_name, p.last_name, p.preferred_name, p.house
       FROM dutch_insurance_apps a
       JOIN people p ON p.id = a.person_id
       ORDER BY a.submitted_date DESC, p.last_name ASC`,
    )
    .all() as DutchInsuranceRow[];
}

export function upsertDutchInsurer(row: DutchInsurer) {
  getDb()
    .prepare(
      `INSERT INTO dutch_insurers (
        id, name, submission_email, submission_method, digid_notes, turnaround_days, notes
      ) VALUES (
        @id, @name, @submission_email, @submission_method, @digid_notes, @turnaround_days, @notes
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        submission_email = excluded.submission_email,
        submission_method = excluded.submission_method,
        digid_notes = excluded.digid_notes,
        turnaround_days = excluded.turnaround_days,
        notes = excluded.notes`,
    )
    .run(row);
}

export function upsertDutchInsuranceApp(row: DutchInsuranceApp) {
  getDb()
    .prepare(
      `INSERT INTO dutch_insurance_apps (
        id, person_id, insurer_id, insurer_name, process_stage, submitted_date, approval_amount,
        currency, extension_flag, appeal_flag, linked_invoice_id, notes, created_at, updated_at
      ) VALUES (
        @id, @person_id, @insurer_id, @insurer_name, @process_stage, @submitted_date, @approval_amount,
        @currency, @extension_flag, @appeal_flag, @linked_invoice_id, @notes, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        insurer_id = excluded.insurer_id,
        insurer_name = excluded.insurer_name,
        process_stage = excluded.process_stage,
        submitted_date = excluded.submitted_date,
        approval_amount = excluded.approval_amount,
        currency = excluded.currency,
        extension_flag = excluded.extension_flag,
        appeal_flag = excluded.appeal_flag,
        linked_invoice_id = excluded.linked_invoice_id,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(row);
}

export function listSaSchemes(): SaScheme[] {
  return getDb().prepare(`SELECT * FROM sa_schemes ORDER BY name ASC`).all() as SaScheme[];
}

export function listSaMedicalAidApps(): SaMedicalAidRow[] {
  return getDb()
    .prepare(
      `SELECT a.*, p.first_name, p.last_name, p.preferred_name, p.house
       FROM sa_medical_aid_apps a
       JOIN people p ON p.id = a.person_id
       ORDER BY a.submitted_date DESC, p.last_name ASC`,
    )
    .all() as SaMedicalAidRow[];
}

export function upsertSaScheme(row: SaScheme) {
  getDb()
    .prepare(
      `INSERT INTO sa_schemes (id, name, portal_url, contact_email, contact_phone, notes)
       VALUES (@id, @name, @portal_url, @contact_email, @contact_phone, @notes)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         portal_url = excluded.portal_url,
         contact_email = excluded.contact_email,
         contact_phone = excluded.contact_phone,
         notes = excluded.notes`,
    )
    .run(row);
}

export function upsertSaMedicalAidApp(row: SaMedicalAidApp) {
  getDb()
    .prepare(
      `INSERT INTO sa_medical_aid_apps (
        id, person_id, scheme_id, scheme_name, auth_status, pmb, co_pay_amount,
        clinical_motivation_status, submitted_date, approved_amount, currency, notes, created_at, updated_at
      ) VALUES (
        @id, @person_id, @scheme_id, @scheme_name, @auth_status, @pmb, @co_pay_amount,
        @clinical_motivation_status, @submitted_date, @approved_amount, @currency, @notes, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        scheme_id = excluded.scheme_id,
        scheme_name = excluded.scheme_name,
        auth_status = excluded.auth_status,
        pmb = excluded.pmb,
        co_pay_amount = excluded.co_pay_amount,
        clinical_motivation_status = excluded.clinical_motivation_status,
        submitted_date = excluded.submitted_date,
        approved_amount = excluded.approved_amount,
        currency = excluded.currency,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(row);
}

export function listVisaApps(facility?: "manor" | "lodge" | "all"): VisaRow[] {
  const sql =
    facility && facility !== "all"
      ? `SELECT v.*, p.first_name, p.last_name, p.preferred_name
         FROM visa_applications v
         JOIN people p ON p.id = v.person_id
         WHERE v.facility = ?
         ORDER BY v.visa_expiry ASC`
      : `SELECT v.*, p.first_name, p.last_name, p.preferred_name
         FROM visa_applications v
         JOIN people p ON p.id = v.person_id
         ORDER BY v.visa_expiry ASC`;
  return facility && facility !== "all"
    ? (getDb().prepare(sql).all(facility) as VisaRow[])
    : (getDb().prepare(sql).all() as VisaRow[]);
}

export function upsertVisaApp(row: VisaApplication) {
  getDb()
    .prepare(
      `INSERT INTO visa_applications (
        id, person_id, facility, passport_expiry, visa_type, visa_expiry,
        vfs_status, extension_status, notes, created_at, updated_at
      ) VALUES (
        @id, @person_id, @facility, @passport_expiry, @visa_type, @visa_expiry,
        @vfs_status, @extension_status, @notes, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        facility = excluded.facility,
        passport_expiry = excluded.passport_expiry,
        visa_type = excluded.visa_type,
        visa_expiry = excluded.visa_expiry,
        vfs_status = excluded.vfs_status,
        extension_status = excluded.extension_status,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(row);
}

export function listPaymentInvoices(): PaymentInvoiceRow[] {
  return getDb()
    .prepare(
      `SELECT i.*,
              COALESCE(p.first_name || ' ' || p.last_name, '') AS client_name,
              COALESCE(p.house, '') AS facility
       FROM invoices i
       LEFT JOIN people p ON p.id = i.person_id
       ORDER BY
         CASE i.status WHEN 'pending' THEN 0 WHEN 'due' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
         i.due_date ASC,
         i.created_at DESC`,
    )
    .all() as PaymentInvoiceRow[];
}

export function replaceInvoiceRequest(row: InvoiceRequest) {
  getDb()
    .prepare(
      `INSERT INTO invoice_requests (
        id, person_id, client_name, facility, phase, amount_hint, currency, notes,
        requested_by, requested_at, status, invoice_id, created_at, updated_at
      ) VALUES (
        @id, @person_id, @client_name, @facility, @phase, @amount_hint, @currency, @notes,
        @requested_by, @requested_at, @status, @invoice_id, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        invoice_id = excluded.invoice_id,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(row);
}

export function insertPaymentInvoice(row: PaymentInvoice) {
  getDb()
    .prepare(
      `INSERT INTO invoices (
        id, person_id, insurance_ref, invoice_number, amount, currency, sent_date, due_date,
        paid_date, status, source_request_id, notes, created_at, updated_at
      ) VALUES (
        @id, @person_id, @insurance_ref, @invoice_number, @amount, @currency, @sent_date, @due_date,
        @paid_date, @status, @source_request_id, @notes, @created_at, @updated_at
      )`,
    )
    .run(row);
}

export function listInvoiceRequests(limit = 40): InvoiceRequest[] {
  return getDb()
    .prepare(`SELECT * FROM invoice_requests ORDER BY requested_at DESC LIMIT ?`)
    .all(limit) as InvoiceRequest[];
}

export function nextInvoiceNumber() {
  const count = (getDb().prepare(`SELECT COUNT(*) as c FROM invoices`).get() as { c: number }).c;
  return `RH-${String(1000 + count + 1)}`;
}

export type RaiseInvoiceInput = {
  personId: string;
  amountHint?: number;
  currency?: Currency;
  notes?: string;
  requestedBy: User;
};

/**
 * Records a durable Sage invoice request and a pending Invoices row.
 * Does NOT post to Sage — the Sage bot owns ledger writes.
 * TODO: email accounts@ / Sage Bot to Action when mail is wired.
 */
export function raiseSageInvoice(input: RaiseInvoiceInput) {
  const person = getPerson(input.personId);
  if (!person) return { ok: false as const, error: "Client not found" };
  const billing = getAccountBilling(input.personId);
  const requested_at = nowIso();
  const requestId = newId("irq");
  const invoiceId = newId("inv");
  const amount =
    input.amountHint ??
    billing?.rate_amount ??
    (billing ? billing.total_amount - billing.amount_paid : 0);
  const currency = (input.currency ?? billing?.rate_currency ?? person.currency ?? "ZAR") as Currency;
  const phase =
    billing?.account_group === "phase_1"
      ? "1"
      : billing?.account_group === "phase_2"
        ? "2"
        : billing?.account_group === "phase_3"
          ? "3"
          : person.manor_phase || "";

  const request: InvoiceRequest = {
    id: requestId,
    person_id: person.id,
    client_name: personDisplayName(person),
    facility: person.house || "",
    phase,
    amount_hint: amount,
    currency,
    notes: input.notes ?? "",
    requested_by: input.requestedBy.id,
    requested_at,
    status: "pending",
    invoice_id: invoiceId,
    created_at: requested_at,
    updated_at: requested_at,
  };

  const invoice: PaymentInvoice = {
    id: invoiceId,
    person_id: person.id,
    insurance_ref: "",
    invoice_number: nextInvoiceNumber(),
    amount,
    currency,
    sent_date: "",
    due_date: shiftDate(todayDate(), 14),
    paid_date: "",
    status: "pending",
    source_request_id: requestId,
    notes: input.notes
      ? `Sage raise request · ${input.notes}`
      : "Sage raise request — pending Sage bot posting",
    created_at: requested_at,
    updated_at: requested_at,
  };

  const tx = getDb().transaction(() => {
    replaceInvoiceRequest(request);
    insertPaymentInvoice(invoice);
    if (billing) {
      upsertAccountBilling({
        ...billing,
        invoice_status: "pending",
        updated_at: requested_at,
      });
    }
  });
  tx();

  // TODO: notify accounts@ / Sage Bot to Action via ops mail when wired.
  const event = writeFinanceEvent({
    entityType: "invoice_request",
    entityId: requestId,
    action: "raise_sage_invoice",
    summary: `Raise Sage invoice for ${request.client_name}`,
    actorId: input.requestedBy.id,
    before: null,
    after: { request, invoice },
  });

  return {
    ok: true as const,
    request,
    invoice,
    event,
    notify: {
      todo: "Email accounts@ / Sage Bot to Action — mail not wired yet",
      status: "pending" as InvoiceRequestStatus,
    },
  };
}

export function countAccountGroups(): Record<AccountGroup | "all", number> {
  const rows = listAccountRows("all");
  const counts: Record<AccountGroup | "all", number> = {
    all: rows.length,
    new_admissions: 0,
    phase_1: 0,
    phase_2: 0,
    phase_3: 0,
    discharged: 0,
  };
  for (const row of rows) counts[row.account_group] += 1;
  return counts;
}
