import {
  upsertAccountBilling,
  upsertDutchInsuranceApp,
  upsertDutchInsurer,
  upsertSaMedicalAidApp,
  upsertSaScheme,
  upsertVisaApp,
  insertPaymentInvoice,
  getAccountBilling,
} from "./finance";
import type { AccountGroup, InvoiceStatus } from "./finance-types";
import { getDb } from "./db";
import { newId } from "./passwords";
import { findPersonByName } from "./people";
import type { Currency } from "./types";

function isoDaysFromAnchor(daysFromToday: number) {
  // Anchor near seed "today" (2026-09-22) so renewals demo stays stable.
  const d = new Date("2026-09-22T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function money(total: number, paid: number) {
  const percent = total > 0 ? Math.round((paid / total) * 1000) / 10 : 0;
  return { total_amount: total, amount_paid: paid, percent_paid: percent };
}

function seedBilling(input: {
  first: string;
  last: string;
  group: AccountGroup;
  rate: number;
  currency?: Currency;
  arp: string;
  arfSent?: number;
  lastInvoice?: string;
  nextInvoice?: string;
  status?: InvoiceStatus;
  notes?: string;
}) {
  const person = findPersonByName(input.first, input.last);
  if (!person) return;
  if (getAccountBilling(person.id)) return;
  const totals = money(input.rate * 2, Math.round(input.rate * (input.status === "paid" ? 2 : 0.6)));
  const created = new Date().toISOString();
  upsertAccountBilling({
    id: newId("ab"),
    person_id: person.id,
    account_group: input.group,
    rate_amount: input.rate,
    rate_currency: input.currency ?? "ZAR",
    arf_sent: input.arfSent ?? (person.arf_signed ? 1 : 0),
    arp_name: input.arp,
    ...totals,
    last_invoice_date: input.lastInvoice ?? "",
    next_invoice_date: input.nextInvoice ?? "",
    invoice_status: input.status ?? "sent",
    notes: input.notes ?? "",
    created_at: created,
    updated_at: created,
  });
}

export function seedFinance() {
  const insurerCount = (getDb().prepare(`SELECT COUNT(*) as c FROM dutch_insurers`).get() as { c: number })
    .c;
  if (insurerCount === 0) {
    upsertDutchInsurer({
      id: "di_cz",
      name: "CZ",
      submission_email: "zorgmachtiging@cz.nl.invalid",
      submission_method: "Secure portal + DigiD",
      digid_notes: "Use organisation DigiD; attach clinical cover letter.",
      turnaround_days: 21,
      notes: "Primary NL medical insurer for demo.",
    });
    upsertDutchInsurer({
      id: "di_asr",
      name: "ASR",
      submission_email: "machtiging@asr.nl.invalid",
      submission_method: "Email PDF pack",
      digid_notes: "Portal optional; email preferred for foreign facilities.",
      turnaround_days: 28,
      notes: "",
    });
    upsertDutchInsurer({
      id: "di_vgz",
      name: "VGZ",
      submission_email: "buitenland@vgz.nl.invalid",
      submission_method: "VGZ zorgverlener portal",
      digid_notes: "Requires DigiD for status checks.",
      turnaround_days: 14,
      notes: "Faster turnaround when pre-auth is complete.",
    });
  }

  const schemeCount = (getDb().prepare(`SELECT COUNT(*) as c FROM sa_schemes`).get() as { c: number }).c;
  if (schemeCount === 0) {
    upsertSaScheme({
      id: "ss_discovery",
      name: "Discovery Health",
      portal_url: "https://www.discovery.co.za.invalid",
      contact_email: "hospitalauth@discovery.invalid",
      contact_phone: "0860 99 88 77",
      notes: "PMB pathway common for substance use.",
    });
    upsertSaScheme({
      id: "ss_gems",
      name: "GEMS",
      portal_url: "https://www.gems.gov.za.invalid",
      contact_email: "auth@gems.invalid",
      contact_phone: "0860 00 4367",
      notes: "Public-sector scheme; longer auth cycles.",
    });
    upsertSaScheme({
      id: "ss_bonitas",
      name: "Bonitas",
      portal_url: "https://www.bonitas.co.za.invalid",
      contact_email: "hospital@bonitas.invalid",
      contact_phone: "0860 002 108",
      notes: "",
    });
  }

  // Accounts — mix of groups + renewal dates around seed "today"
  seedBilling({
    first: "Noah",
    last: "Botha",
    group: "new_admissions",
    rate: 85000,
    arp: "Botha Family Trust",
    arfSent: 1,
    nextInvoice: isoDaysFromAnchor(3),
    status: "pending",
    notes: "Admit queue — deposit received, first invoice soon.",
  });
  seedBilling({
    first: "Aisha",
    last: "Khan",
    group: "new_admissions",
    rate: 92000,
    arp: "Khan Holdings",
    arfSent: 1,
    nextInvoice: isoDaysFromAnchor(10),
    status: "none",
  });
  seedBilling({
    first: "Amelia",
    last: "Hart",
    group: "phase_1",
    rate: 78000,
    currency: "ZAR",
    arp: "Claire Hart",
    lastInvoice: isoDaysFromAnchor(-20),
    nextInvoice: isoDaysFromAnchor(5),
    status: "sent",
  });
  seedBilling({
    first: "Maya",
    last: "Dlamini",
    group: "phase_1",
    rate: 78000,
    arp: "Dlamini Family",
    lastInvoice: isoDaysFromAnchor(-25),
    nextInvoice: isoDaysFromAnchor(-2),
    status: "overdue",
  });
  seedBilling({
    first: "James",
    last: "Okonkwo",
    group: "phase_2",
    rate: 72000,
    arp: "Okonkwo NOK",
    lastInvoice: isoDaysFromAnchor(-18),
    nextInvoice: isoDaysFromAnchor(12),
    status: "sent",
  });
  seedBilling({
    first: "Sophie",
    last: "Laurent",
    group: "phase_2",
    rate: 68000,
    currency: "EUR",
    arp: "Laurent SA",
    lastInvoice: isoDaysFromAnchor(-14),
    nextInvoice: isoDaysFromAnchor(7),
    status: "sent",
    notes: "Dutch insurance linked — EUR billing.",
  });
  seedBilling({
    first: "Jordan",
    last: "Naidoo",
    group: "phase_3",
    rate: 45000,
    arp: "Naidoo Family",
    lastInvoice: isoDaysFromAnchor(-10),
    nextInvoice: isoDaysFromAnchor(18),
    status: "paid",
  });
  seedBilling({
    first: "Theo",
    last: "Botha",
    group: "phase_3",
    rate: 45000,
    arp: "S Botha",
    lastInvoice: isoDaysFromAnchor(-28),
    nextInvoice: isoDaysFromAnchor(1),
    status: "sent",
  });
  seedBilling({
    first: "Henrik",
    last: "Solberg",
    group: "phase_3",
    rate: 52000,
    currency: "EUR",
    arp: "Solberg AS",
    lastInvoice: isoDaysFromAnchor(-21),
    nextInvoice: isoDaysFromAnchor(-5),
    status: "overdue",
    notes: "Visa + Dutch insurance also open.",
  });
  seedBilling({
    first: "Camila",
    last: "Duarte",
    group: "discharged",
    rate: 45000,
    arp: "Duarte Family",
    lastInvoice: isoDaysFromAnchor(-40),
    nextInvoice: "",
    status: "paid",
    notes: "Demo discharged card — retained for accounts history.",
  });

  // Mark Camila discharged in people if still resident (demo only, soft)
  const camila = findPersonByName("Camila", "Duarte");
  if (camila && !camila.archived_at && camila.stage === "resident") {
    // Keep as resident for occupancy — discharged is accounts group only for demo.
  }

  const dutchCount = (
    getDb().prepare(`SELECT COUNT(*) as c FROM dutch_insurance_apps`).get() as { c: number }
  ).c;
  if (dutchCount === 0) {
    const sophie = findPersonByName("Sophie", "Laurent");
    const henrik = findPersonByName("Henrik", "Solberg");
    const nina = findPersonByName("Nina", "Petrova");
    const created = new Date().toISOString();
    if (sophie) {
      upsertDutchInsuranceApp({
        id: newId("dia"),
        person_id: sophie.id,
        insurer_id: "di_cz",
        insurer_name: "CZ",
        process_stage: "awaiting",
        submitted_date: isoDaysFromAnchor(-12),
        approval_amount: 0,
        currency: "EUR",
        extension_flag: 0,
        appeal_flag: 0,
        linked_invoice_id: "",
        notes: "Initial 28-day cover request.",
        created_at: created,
        updated_at: created,
      });
    }
    if (henrik) {
      upsertDutchInsuranceApp({
        id: newId("dia"),
        person_id: henrik.id,
        insurer_id: "di_vgz",
        insurer_name: "VGZ",
        process_stage: "appealed",
        submitted_date: isoDaysFromAnchor(-30),
        approval_amount: 12000,
        currency: "EUR",
        extension_flag: 1,
        appeal_flag: 1,
        linked_invoice_id: "",
        notes: "Partial approval — appeal lodged for extension.",
        created_at: created,
        updated_at: created,
      });
    }
    if (nina) {
      upsertDutchInsuranceApp({
        id: newId("dia"),
        person_id: nina.id,
        insurer_id: "di_asr",
        insurer_name: "ASR",
        process_stage: "approved",
        submitted_date: isoDaysFromAnchor(-40),
        approval_amount: 18500,
        currency: "EUR",
        extension_flag: 0,
        appeal_flag: 0,
        linked_invoice_id: "",
        notes: "Approved for Phase 1.",
        created_at: created,
        updated_at: created,
      });
    }
  }

  const saCount = (getDb().prepare(`SELECT COUNT(*) as c FROM sa_medical_aid_apps`).get() as { c: number })
    .c;
  if (saCount === 0) {
    const maya = findPersonByName("Maya", "Dlamini");
    const jordan = findPersonByName("Jordan", "Naidoo");
    const leah = findPersonByName("Leah", "Abrahams");
    const created = new Date().toISOString();
    if (maya) {
      upsertSaMedicalAidApp({
        id: newId("saa"),
        person_id: maya.id,
        scheme_id: "ss_discovery",
        scheme_name: "Discovery Health",
        auth_status: "authorised",
        pmb: 1,
        co_pay_amount: 8500,
        clinical_motivation_status: "accepted",
        submitted_date: isoDaysFromAnchor(-35),
        approved_amount: 65000,
        currency: "ZAR",
        notes: "PMB pathway authorised.",
        created_at: created,
        updated_at: created,
      });
    }
    if (jordan) {
      upsertSaMedicalAidApp({
        id: newId("saa"),
        person_id: jordan.id,
        scheme_id: "ss_gems",
        scheme_name: "GEMS",
        auth_status: "submitted",
        pmb: 0,
        co_pay_amount: 0,
        clinical_motivation_status: "submitted",
        submitted_date: isoDaysFromAnchor(-8),
        approved_amount: 0,
        currency: "ZAR",
        notes: "Awaiting hospital auth.",
        created_at: created,
        updated_at: created,
      });
    }
    if (leah) {
      upsertSaMedicalAidApp({
        id: newId("saa"),
        person_id: leah.id,
        scheme_id: "ss_bonitas",
        scheme_name: "Bonitas",
        auth_status: "partial",
        pmb: 1,
        co_pay_amount: 12000,
        clinical_motivation_status: "drafting",
        submitted_date: isoDaysFromAnchor(-15),
        approved_amount: 40000,
        currency: "ZAR",
        notes: "Partial days authorised — motivation for remaining stay.",
        created_at: created,
        updated_at: created,
      });
    }
  }

  const visaCount = (getDb().prepare(`SELECT COUNT(*) as c FROM visa_applications`).get() as { c: number })
    .c;
  if (visaCount === 0) {
    const created = new Date().toISOString();
    const rows: Array<{
      first: string;
      last: string;
      facility: "manor" | "lodge";
      passport: string;
      visa: string;
      type: "medical" | "tourist";
      vfs: string;
      ext: string;
    }> = [
      {
        first: "Sophie",
        last: "Laurent",
        facility: "manor",
        passport: isoDaysFromAnchor(400),
        visa: isoDaysFromAnchor(45),
        type: "medical",
        vfs: "Biometrics done",
        ext: "Monitoring",
      },
      {
        first: "Henrik",
        last: "Solberg",
        facility: "lodge",
        passport: isoDaysFromAnchor(200),
        visa: isoDaysFromAnchor(18),
        type: "medical",
        vfs: "Appointment booked",
        ext: "Extension requested",
      },
      {
        first: "Nina",
        last: "Petrova",
        facility: "manor",
        passport: isoDaysFromAnchor(90),
        visa: isoDaysFromAnchor(55),
        type: "tourist",
        vfs: "Not required yet",
        ext: "None",
      },
      {
        first: "Camila",
        last: "Duarte",
        facility: "lodge",
        passport: isoDaysFromAnchor(500),
        visa: isoDaysFromAnchor(-3),
        type: "medical",
        vfs: "Overstay risk — urgent",
        ext: "Urgent extension",
      },
    ];
    for (const row of rows) {
      const person = findPersonByName(row.first, row.last);
      if (!person) continue;
      upsertVisaApp({
        id: newId("visa"),
        person_id: person.id,
        facility: row.facility,
        passport_expiry: row.passport,
        visa_type: row.type,
        visa_expiry: row.visa,
        vfs_status: row.vfs,
        extension_status: row.ext,
        notes: "",
        created_at: created,
        updated_at: created,
      });
    }
  }

  const invCount = (getDb().prepare(`SELECT COUNT(*) as c FROM invoices`).get() as { c: number }).c;
  if (invCount === 0) {
    const amelia = findPersonByName("Amelia", "Hart");
    const maya = findPersonByName("Maya", "Dlamini");
    const jordan = findPersonByName("Jordan", "Naidoo");
    const created = new Date().toISOString();
    if (amelia) {
      insertPaymentInvoice({
        id: newId("inv"),
        person_id: amelia.id,
        insurance_ref: "",
        invoice_number: "RH-1001",
        amount: 78000,
        currency: "ZAR",
        sent_date: isoDaysFromAnchor(-20),
        due_date: isoDaysFromAnchor(-6),
        paid_date: "",
        status: "due",
        source_request_id: "",
        notes: "Phase 1 cycle",
        created_at: created,
        updated_at: created,
      });
    }
    if (maya) {
      insertPaymentInvoice({
        id: newId("inv"),
        person_id: maya.id,
        insurance_ref: "Discovery PMB",
        invoice_number: "RH-1002",
        amount: 65000,
        currency: "ZAR",
        sent_date: isoDaysFromAnchor(-25),
        due_date: isoDaysFromAnchor(-11),
        paid_date: isoDaysFromAnchor(-10),
        status: "paid",
        source_request_id: "",
        notes: "Medical aid portion",
        created_at: created,
        updated_at: created,
      });
    }
    if (jordan) {
      insertPaymentInvoice({
        id: newId("inv"),
        person_id: jordan.id,
        insurance_ref: "GEMS",
        invoice_number: "RH-1003",
        amount: 45000,
        currency: "ZAR",
        sent_date: isoDaysFromAnchor(-10),
        due_date: isoDaysFromAnchor(4),
        paid_date: "",
        status: "sent",
        source_request_id: "",
        notes: "Lodge Phase 3",
        created_at: created,
        updated_at: created,
      });
    }
  }
}
