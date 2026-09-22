import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      house TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      UNIQUE (house, name)
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      preferred_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      enquiry_date TEXT NOT NULL DEFAULT '',
      lead_source TEXT NOT NULL DEFAULT 'other',
      lead_source_note TEXT NOT NULL DEFAULT '',
      next_of_kin_name TEXT NOT NULL DEFAULT '',
      next_of_kin_phone TEXT NOT NULL DEFAULT '',
      funding_type TEXT NOT NULL DEFAULT 'private',
      funding_notes TEXT NOT NULL DEFAULT '',
      expected_arrival TEXT NOT NULL DEFAULT '',
      house_preference TEXT NOT NULL DEFAULT '',
      commercial_notes TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL,
      house TEXT NOT NULL DEFAULT '',
      room_id TEXT NOT NULL DEFAULT '',
      accounts_approved INTEGER NOT NULL DEFAULT 0,
      clinical_approved INTEGER NOT NULL DEFAULT 0,
      deposit_received INTEGER NOT NULL DEFAULT 0,
      funding_confirmed INTEGER NOT NULL DEFAULT 0,
      admission_date_agreed INTEGER NOT NULL DEFAULT 0,
      room_offered INTEGER NOT NULL DEFAULT 0,
      within_handoff_status TEXT NOT NULL DEFAULT 'none',
      admitted_at TEXT NOT NULL DEFAULT '',
      archived_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0,
      undone_at TEXT NOT NULL DEFAULT '',
      undo_of TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_people_stage ON people(stage);
    CREATE INDEX IF NOT EXISTS idx_people_house ON people(house);
    CREATE INDEX IF NOT EXISTS idx_people_room ON people(room_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_id, created_at);
  `);

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(people)`).all() as { name: string }[]).map((column) => column.name),
  );
  if (!columns.has("within_client_id")) {
    db.exec(`ALTER TABLE people ADD COLUMN within_client_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!columns.has("admission_kind")) {
    db.exec(`ALTER TABLE people ADD COLUMN admission_kind TEXT NOT NULL DEFAULT ''`);
  }

  const extras: { name: string; ddl: string }[] = [
    { name: "room_privacy", ddl: `ALTER TABLE people ADD COLUMN room_privacy TEXT NOT NULL DEFAULT ''` },
    { name: "arp_signed", ddl: `ALTER TABLE people ADD COLUMN arp_signed INTEGER NOT NULL DEFAULT 0` },
    { name: "arf_signed", ddl: `ALTER TABLE people ADD COLUMN arf_signed INTEGER NOT NULL DEFAULT 0` },
    {
      name: "addon_medical_float",
      ddl: `ALTER TABLE people ADD COLUMN addon_medical_float INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "addon_nursing_medical_admission",
      ddl: `ALTER TABLE people ADD COLUMN addon_nursing_medical_admission INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "addon_psych_admission",
      ddl: `ALTER TABLE people ADD COLUMN addon_psych_admission INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "addon_overnight_supervision",
      ddl: `ALTER TABLE people ADD COLUMN addon_overnight_supervision INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "transfer_extension_status",
      ddl: `ALTER TABLE people ADD COLUMN transfer_extension_status TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: "transfer_extension_notes",
      ddl: `ALTER TABLE people ADD COLUMN transfer_extension_notes TEXT NOT NULL DEFAULT ''`,
    },
    { name: "contact_method", ddl: `ALTER TABLE people ADD COLUMN contact_method TEXT NOT NULL DEFAULT ''` },
    {
      name: "assigned_to_user_id",
      ddl: `ALTER TABLE people ADD COLUMN assigned_to_user_id TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: "counsellor_user_id",
      ddl: `ALTER TABLE people ADD COLUMN counsellor_user_id TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: "referral_owner_user_id",
      ddl: `ALTER TABLE people ADD COLUMN referral_owner_user_id TEXT NOT NULL DEFAULT ''`,
    },
    { name: "referrer_name", ddl: `ALTER TABLE people ADD COLUMN referrer_name TEXT NOT NULL DEFAULT ''` },
    {
      name: "referrer_contact_person",
      ddl: `ALTER TABLE people ADD COLUMN referrer_contact_person TEXT NOT NULL DEFAULT ''`,
    },
    { name: "referrer_phone", ddl: `ALTER TABLE people ADD COLUMN referrer_phone TEXT NOT NULL DEFAULT ''` },
    { name: "currency", ddl: `ALTER TABLE people ADD COLUMN currency TEXT NOT NULL DEFAULT 'ZAR'` },
    {
      name: "preferred_room_id",
      ddl: `ALTER TABLE people ADD COLUMN preferred_room_id TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: "assessment_details",
      ddl: `ALTER TABLE people ADD COLUMN assessment_details TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: "assessment_notes",
      ddl: `ALTER TABLE people ADD COLUMN assessment_notes TEXT NOT NULL DEFAULT ''`,
    },
    { name: "manor_phase", ddl: `ALTER TABLE people ADD COLUMN manor_phase TEXT NOT NULL DEFAULT ''` },
    { name: "admission_date", ddl: `ALTER TABLE people ADD COLUMN admission_date TEXT NOT NULL DEFAULT ''` },
    {
      name: "planned_discharge_date",
      ddl: `ALTER TABLE people ADD COLUMN planned_discharge_date TEXT NOT NULL DEFAULT ''`,
    },
  ];
  for (const column of extras) {
    if (!columns.has(column.name)) {
      db.exec(column.ddl);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS person_documents (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      for_within INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_person_documents_person ON person_documents(person_id, created_at);

    CREATE TABLE IF NOT EXISTS account_billing (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL UNIQUE,
      account_group TEXT NOT NULL,
      rate_amount REAL NOT NULL DEFAULT 0,
      rate_currency TEXT NOT NULL DEFAULT 'ZAR',
      arf_sent INTEGER NOT NULL DEFAULT 0,
      arp_name TEXT NOT NULL DEFAULT '',
      amount_paid REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      percent_paid REAL NOT NULL DEFAULT 0,
      last_invoice_date TEXT NOT NULL DEFAULT '',
      next_invoice_date TEXT NOT NULL DEFAULT '',
      invoice_status TEXT NOT NULL DEFAULT 'none',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_account_billing_group ON account_billing(account_group);
    CREATE INDEX IF NOT EXISTS idx_account_billing_next ON account_billing(next_invoice_date);

    CREATE TABLE IF NOT EXISTS invoice_requests (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      facility TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT '',
      amount_hint REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      notes TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL DEFAULT '',
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      invoice_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_requests_person ON invoice_requests(person_id, requested_at);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL DEFAULT '',
      insurance_ref TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      sent_date TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      paid_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      source_request_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_person ON invoices(person_id, due_date);

    CREATE TABLE IF NOT EXISTS dutch_insurers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      submission_email TEXT NOT NULL DEFAULT '',
      submission_method TEXT NOT NULL DEFAULT '',
      digid_notes TEXT NOT NULL DEFAULT '',
      turnaround_days INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS dutch_insurance_apps (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      insurer_id TEXT NOT NULL DEFAULT '',
      insurer_name TEXT NOT NULL DEFAULT '',
      process_stage TEXT NOT NULL DEFAULT 'intake',
      submitted_date TEXT NOT NULL DEFAULT '',
      approval_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      extension_flag INTEGER NOT NULL DEFAULT 0,
      appeal_flag INTEGER NOT NULL DEFAULT 0,
      linked_invoice_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sa_schemes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      portal_url TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sa_medical_aid_apps (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      scheme_id TEXT NOT NULL DEFAULT '',
      scheme_name TEXT NOT NULL DEFAULT '',
      auth_status TEXT NOT NULL DEFAULT 'pending',
      pmb INTEGER NOT NULL DEFAULT 0,
      co_pay_amount REAL NOT NULL DEFAULT 0,
      clinical_motivation_status TEXT NOT NULL DEFAULT 'not_started',
      submitted_date TEXT NOT NULL DEFAULT '',
      approved_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visa_applications (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      facility TEXT NOT NULL DEFAULT '',
      passport_expiry TEXT NOT NULL DEFAULT '',
      visa_type TEXT NOT NULL DEFAULT 'medical',
      visa_expiry TEXT NOT NULL DEFAULT '',
      vfs_status TEXT NOT NULL DEFAULT '',
      extension_status TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visa_facility ON visa_applications(facility);

    CREATE TABLE IF NOT EXISTS finance_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0,
      undone_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_events_entity ON finance_events(entity_id, created_at);
  `);
}
