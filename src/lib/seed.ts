import { writeAudit } from "./audit";
import { getDb } from "./db";
import { seedFinance } from "./finance-seed";
import { roomId } from "./houses";
import { newId } from "./passwords";
import { findPersonByName, insertPerson, replacePerson } from "./people";
import { ensureRooms } from "./rooms";
import type { House, LeadSource, Person, Stage } from "./types";
import { upsertUser } from "./users";

const STAFF = [
  {
    id: "user_therapist",
    email: "therapist@liberty.local",
    name: "Lelethu Therapist",
    role: "therapist" as const,
    password: "liberty",
  },
  {
    id: "user_admissions",
    email: "admissions@liberty.local",
    name: "Naledi Admissions",
    role: "admissions" as const,
    password: "liberty",
  },
  {
    id: "user_accounts",
    email: "accounts@liberty.local",
    name: "Pieter Accounts",
    role: "accounts" as const,
    password: "liberty",
  },
];

function iso(daysAgo: number, hour = 10) {
  const d = new Date("2026-09-18T10:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function person(partial: Partial<Person> & Pick<Person, "first_name" | "last_name" | "stage">): Person {
  const created = partial.created_at ?? iso(20);
  return {
    id: partial.id ?? newId("p"),
    first_name: partial.first_name,
    last_name: partial.last_name,
    preferred_name: partial.preferred_name ?? "",
    email: partial.email ?? `${partial.first_name.toLowerCase()}.${partial.last_name.toLowerCase()}@example.invalid`,
    phone: partial.phone ?? "021 555 0100",
    enquiry_date: partial.enquiry_date ?? created.slice(0, 10),
    lead_source: partial.lead_source ?? "family",
    lead_source_note: partial.lead_source_note ?? "",
    contact_method: partial.contact_method ?? "phone",
    assigned_to_user_id: partial.assigned_to_user_id ?? "user_admissions",
    counsellor_user_id: partial.counsellor_user_id ?? "",
    referral_owner_user_id: partial.referral_owner_user_id ?? "user_admissions",
    referrer_name: partial.referrer_name ?? "",
    referrer_contact_person: partial.referrer_contact_person ?? "",
    referrer_phone: partial.referrer_phone ?? "",
    next_of_kin_name: partial.next_of_kin_name ?? "",
    next_of_kin_phone: partial.next_of_kin_phone ?? "",
    funding_type: partial.funding_type ?? "private",
    funding_notes: partial.funding_notes ?? "",
    currency: partial.currency ?? "ZAR",
    expected_arrival: partial.expected_arrival ?? "",
    admission_date: partial.admission_date ?? "",
    planned_discharge_date: partial.planned_discharge_date ?? "",
    house_preference: partial.house_preference ?? "",
    preferred_room_id: partial.preferred_room_id ?? "",
    commercial_notes: partial.commercial_notes ?? "",
    assessment_details: partial.assessment_details ?? "",
    assessment_notes: partial.assessment_notes ?? "",
    stage: partial.stage,
    house: partial.house ?? "",
    room_id: partial.room_id ?? "",
    room_privacy: partial.room_privacy ?? "",
    manor_phase: partial.manor_phase ?? "",
    accounts_approved: partial.accounts_approved ?? 0,
    clinical_approved: partial.clinical_approved ?? 0,
    deposit_received: partial.deposit_received ?? 0,
    arp_signed: partial.arp_signed ?? 0,
    arf_signed: partial.arf_signed ?? 0,
    funding_confirmed: partial.funding_confirmed ?? 0,
    admission_date_agreed: partial.admission_date_agreed ?? 0,
    room_offered: partial.room_offered ?? 0,
    addon_medical_float: partial.addon_medical_float ?? 0,
    addon_nursing_medical_admission: partial.addon_nursing_medical_admission ?? 0,
    addon_psych_admission: partial.addon_psych_admission ?? 0,
    addon_overnight_supervision: partial.addon_overnight_supervision ?? 0,
    transfer_extension_status: partial.transfer_extension_status ?? "",
    transfer_extension_notes: partial.transfer_extension_notes ?? "",
    within_handoff_status: partial.within_handoff_status ?? "none",
    within_client_id: partial.within_client_id ?? "",
    admission_kind: partial.admission_kind ?? "",
    admitted_at: partial.admitted_at ?? "",
    archived_at: partial.archived_at ?? "",
    created_at: created,
    updated_at: partial.updated_at ?? created,
  };
}

function resident(first: string, last: string, house: House, room: string, daysAgo: number): Person {
  const admitted = iso(daysAgo, 12);
  return person({
    first_name: first,
    last_name: last,
    stage: "resident",
    house,
    room_id: roomId(house, room),
    preferred_room_id: roomId(house, room),
    house_preference: house,
    manor_phase: house === "manor" ? "1" : "",
    lead_source: "referral_partner",
    funding_type: "private",
    currency: "ZAR",
    contact_method: "phone",
    counsellor_user_id: "user_therapist",
    assigned_to_user_id: "user_admissions",
    referral_owner_user_id: "user_admissions",
    admission_date: admitted.slice(0, 10),
    planned_discharge_date: iso(daysAgo - 28, 12).slice(0, 10),
    accounts_approved: 1,
    clinical_approved: 1,
    deposit_received: 1,
    arp_signed: 1,
    arf_signed: 1,
    funding_confirmed: 1,
    admission_date_agreed: 1,
    room_offered: 1,
    room_privacy: "private",
    within_handoff_status: "stub_sent",
    within_client_id: `reach-${first.toLowerCase()}-${last.toLowerCase()}`,
    admission_kind: "program",
    admitted_at: admitted,
    created_at: iso(daysAgo + 14, 9),
    updated_at: admitted,
    commercial_notes: "Fictional resident for occupancy seed. Commercial file only.",
  });
}

function seedIfMissing(row: Person) {
  if (findPersonByName(row.first_name, row.last_name)) return null;
  insertPerson(row);
  return row;
}

function seedAmelia() {
  if (findPersonByName("Amelia", "Hart")) return;

  const enquiry = person({
    id: "p_amelia_hart",
    first_name: "Amelia",
    last_name: "Hart",
    preferred_name: "Millie",
    email: "amelia.hart@example.invalid",
    phone: "021 555 0142",
    lead_source: "family",
    lead_source_note: "Mother, Claire Hart, called the admissions line.",
    contact_method: "phone",
    assigned_to_user_id: "user_admissions",
    referral_owner_user_id: "user_admissions",
    referrer_name: "Claire Hart",
    referrer_contact_person: "Claire Hart",
    referrer_phone: "021 555 0143",
    next_of_kin_name: "Claire Hart",
    next_of_kin_phone: "021 555 0143",
    funding_type: "private",
    funding_notes: "Family-funded, 28-day programme.",
    currency: "ZAR",
    expected_arrival: "2026-09-12",
    admission_date: "2026-09-12",
    house_preference: "manor",
    preferred_room_id: roomId("manor", "Yew"),
    assessment_details: "Family assessment completed; programme recommended.",
    assessment_notes: "Mother supportive. Ready for Manor Phase 1.",
    commercial_notes: "Journey seed: Enquiries → Next Steps → Approval → Admit onto Manor Yew.",
    stage: "enquiry",
    created_at: iso(21, 8),
    updated_at: iso(21, 8),
    enquiry_date: iso(21, 8).slice(0, 10),
  });
  insertPerson(enquiry);
  writeAudit({
    personId: enquiry.id,
    action: "create",
    summary: "Opened enquiry for Amelia Hart",
    actorId: "user_admissions",
    before: null,
    after: enquiry,
    createdAt: iso(21, 8),
  });

  const nextSteps: Person = {
    ...enquiry,
    stage: "next_steps",
    commercial_notes: "Family sent ID and medical aid details. Assessment call booked.",
    updated_at: iso(18, 11),
  };
  getDb()
    .prepare(`UPDATE people SET stage = ?, commercial_notes = ?, updated_at = ? WHERE id = ?`)
    .run(nextSteps.stage, nextSteps.commercial_notes, nextSteps.updated_at, enquiry.id);
  writeAudit({
    personId: enquiry.id,
    action: "stage_move",
    summary: "Moved to Next Steps",
    actorId: "user_admissions",
    before: enquiry,
    after: nextSteps,
    createdAt: iso(18, 11),
  });

  const approval: Person = {
    ...nextSteps,
    stage: "approval",
    accounts_approved: 1,
    funding_confirmed: 1,
    updated_at: iso(15, 9),
  };
  getDb()
    .prepare(
      `UPDATE people SET stage = ?, accounts_approved = 1, funding_confirmed = 1, updated_at = ? WHERE id = ?`,
    )
    .run(approval.stage, approval.updated_at, enquiry.id);
  writeAudit({
    personId: enquiry.id,
    action: "stage_move",
    summary: "Moved to Account and Clinical Approval",
    actorId: "user_accounts",
    before: nextSteps,
    after: approval,
    createdAt: iso(15, 9),
  });

  const ready: Person = {
    ...approval,
    stage: "admit",
    clinical_approved: 1,
    deposit_received: 1,
    arp_signed: 1,
    arf_signed: 1,
    admission_date_agreed: 1,
    room_offered: 1,
    room_privacy: "private",
    updated_at: iso(13, 14),
  };
  getDb()
    .prepare(
      `UPDATE people SET stage = ?, clinical_approved = 1, deposit_received = 1,
       arp_signed = 1, arf_signed = 1, admission_date_agreed = 1, room_offered = 1,
       room_privacy = ?, updated_at = ? WHERE id = ?`,
    )
    .run(ready.stage, ready.room_privacy, ready.updated_at, enquiry.id);
  writeAudit({
    personId: enquiry.id,
    action: "stage_move",
    summary: "Moved to Admit",
    actorId: "user_admissions",
    before: approval,
    after: ready,
    createdAt: iso(13, 14),
  });

  const admitted: Person = {
    ...ready,
    stage: "resident",
    house: "manor",
    room_id: roomId("manor", "Yew"),
    preferred_room_id: roomId("manor", "Yew"),
    room_privacy: "private",
    manor_phase: "1",
    counsellor_user_id: "user_therapist",
    admission_date: "2026-09-12",
    planned_discharge_date: "2026-10-10",
    admitted_at: iso(9, 10),
    within_handoff_status: "pack_ready",
    within_client_id: "reach-p_amelia_hart",
    admission_kind: "program",
    updated_at: iso(9, 10),
  };
  getDb()
    .prepare(
      `UPDATE people SET stage = ?, house = ?, room_id = ?, admitted_at = ?,
       within_handoff_status = ?, within_client_id = ?, admission_kind = ?,
       manor_phase = ?, counsellor_user_id = ?, admission_date = ?, planned_discharge_date = ?,
       preferred_room_id = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      admitted.stage,
      admitted.house,
      admitted.room_id,
      admitted.admitted_at,
      admitted.within_handoff_status,
      admitted.within_client_id,
      admitted.admission_kind,
      admitted.manor_phase,
      admitted.counsellor_user_id,
      admitted.admission_date,
      admitted.planned_discharge_date,
      admitted.preferred_room_id,
      admitted.updated_at,
      enquiry.id,
    );
  writeAudit({
    personId: enquiry.id,
    action: "admit",
    summary: "Confirmed admit to Manor room Yew · Within admission pack (program)",
    actorId: "user_admissions",
    before: ready,
    after: admitted,
    createdAt: iso(9, 10),
  });
}

export function seedIfEmpty() {
  const count = getDb().prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number };
  if (count.c === 0) seed();
}

export function seed() {
  ensureRooms();
  const createdAt = iso(40, 8);
  for (const staff of STAFF) {
    upsertUser({ ...staff, createdAt });
  }

  seedAmelia();

  const manorOthers: [string, string, string, number][] = [
    ["Maya", "Dlamini", "Oak", 40],
    ["James", "Okonkwo", "Willow", 36],
    ["Sophie", "Laurent", "Cedar", 33],
    ["David", "Chen", "Olive", 30],
    ["Leah", "Abrahams", "Fig", 28],
    ["Marcus", "Reid", "Maple", 26],
    ["Nina", "Petrova", "Birch", 24],
    ["Oliver", "Brooks", "Alder", 22],
    ["Fatima", "Yusuf", "Elm", 20],
    ["Ethan", "Clarke", "Ash", 18],
    ["Zanele", "Mokoena", "Pine", 16],
  ];
  for (const [first, last, room, days] of manorOthers) {
    seedIfMissing(resident(first, last, "manor", room, days));
  }

  const lodge: [string, string, string, number][] = [
    ["Jordan", "Naidoo", "Protea", 45],
    ["Theo", "Botha", "Fynbos", 38],
    ["Lindiwe", "Khumalo", "Restio", 34],
    ["Daniel", "Meyer", "Aloe", 29],
    ["Ryan", "Jacobs", "Daisy", 25],
    ["Nomsa", "Radebe", "Iris", 21],
    ["Alex", "Mthembu", "Lily", 17],
    ["Camila", "Duarte", "Fern", 14],
    ["Henrik", "Solberg", "Reed", 11],
  ];
  for (const [first, last, room, days] of lodge) {
    seedIfMissing(resident(first, last, "lodge", room, days));
  }

  const pipeline: Array<Partial<Person> & Pick<Person, "first_name" | "last_name" | "stage">> = [
    {
      first_name: "Priya",
      last_name: "Naidoo",
      stage: "enquiry",
      lead_source: "website",
      phone: "021 555 0201",
      commercial_notes: "Web form. Wants a call this week.",
      created_at: iso(3, 9),
    },
    {
      first_name: "Samir",
      last_name: "Patel",
      stage: "enquiry",
      lead_source: "gp",
      lead_source_note: "Dr Pillay, Constantia.",
      phone: "021 555 0202",
      created_at: iso(2, 15),
    },
    {
      first_name: "Chloe",
      last_name: "van Wyk",
      stage: "enquiry",
      lead_source: "self",
      phone: "021 555 0203",
      created_at: iso(1, 11),
    },
    {
      first_name: "Ben",
      last_name: "Adeyemi",
      stage: "next_steps",
      lead_source: "family",
      expected_arrival: "2026-09-28",
      house_preference: "manor",
      commercial_notes: "Assessment booked. Family visiting Saturday.",
      created_at: iso(8, 10),
    },
    {
      first_name: "Hannah",
      last_name: "Ross",
      stage: "next_steps",
      lead_source: "referral_partner",
      house_preference: "either",
      created_at: iso(6, 13),
    },
    {
      first_name: "Luca",
      last_name: "Moretti",
      stage: "next_steps",
      lead_source: "website",
      funding_type: "medical_aid",
      created_at: iso(5, 8),
    },
    {
      first_name: "Grace",
      last_name: "Ndlovu",
      stage: "approval",
      lead_source: "family",
      house_preference: "lodge",
      accounts_approved: 1,
      funding_confirmed: 0,
      funding_type: "sponsor",
      commercial_notes: "Waiting on sponsor letter.",
      created_at: iso(10, 9),
    },
    {
      first_name: "Tom",
      last_name: "Hughes",
      stage: "approval",
      lead_source: "self",
      accounts_approved: 1,
      clinical_approved: 1,
      funding_confirmed: 1,
      created_at: iso(9, 16),
    },
    {
      first_name: "Isla",
      last_name: "Ferreira",
      stage: "approval",
      lead_source: "gp",
      deposit_received: 1,
      created_at: iso(7, 12),
    },
    {
      first_name: "Noah",
      last_name: "Botha",
      stage: "admit",
      lead_source: "family",
      contact_method: "whatsapp",
      house_preference: "manor",
      preferred_room_id: roomId("manor", "Beech"),
      expected_arrival: "2026-09-22",
      admission_date: "2026-09-22",
      assessment_details: "Assessment done with family present.",
      assessment_notes: "Recommend Manor Phase 1; shared room OK.",
      accounts_approved: 1,
      clinical_approved: 1,
      deposit_received: 1,
      arp_signed: 1,
      arf_signed: 1,
      funding_confirmed: 1,
      admission_date_agreed: 1,
      room_offered: 1,
      room_privacy: "shared",
      commercial_notes: "Ready to confirm. Offer Beech if still vacant.",
      created_at: iso(12, 9),
    },
    {
      first_name: "Aisha",
      last_name: "Khan",
      stage: "admit",
      lead_source: "referral_partner",
      contact_method: "email",
      referrer_name: "Cape Recovery Network",
      referrer_contact_person: "Dr Patel",
      referrer_phone: "021 555 0888",
      house_preference: "lodge",
      expected_arrival: "2026-09-24",
      admission_date: "2026-09-24",
      accounts_approved: 1,
      clinical_approved: 1,
      deposit_received: 1,
      arp_signed: 1,
      arf_signed: 1,
      funding_confirmed: 1,
      admission_date_agreed: 1,
      room_offered: 0,
      room_privacy: "private",
      commercial_notes: "Checklist almost complete — room still to offer.",
      created_at: iso(11, 14),
    },
  ];

  for (const row of pipeline) {
    seedIfMissing(person(row));
  }

  backfillTrialFeedbackGates();
  backfillCindyOccupancyFields();
  backfillHandoffIds();
  seedFinance();
}

/** Keep demo cards complete after schema gates land on an existing DB. */
function backfillTrialFeedbackGates() {
  const db = getDb();
  db.prepare(
    `UPDATE people SET arp_signed = 1, arf_signed = 1,
       room_privacy = CASE WHEN room_privacy = '' THEN 'private' ELSE room_privacy END
     WHERE stage = 'resident' AND archived_at = ''`,
  ).run();
  db.prepare(
    `UPDATE people SET arp_signed = 1, arf_signed = 1,
       room_privacy = CASE WHEN room_privacy = '' THEN 'shared' ELSE room_privacy END
     WHERE first_name = 'Noah' AND last_name = 'Botha'`,
  ).run();
  db.prepare(
    `UPDATE people SET arp_signed = 1, arf_signed = 1,
       room_privacy = CASE WHEN room_privacy = '' THEN 'private' ELSE room_privacy END
     WHERE first_name = 'Aisha' AND last_name = 'Khan'`,
  ).run();
  db.prepare(
    `UPDATE people SET arp_signed = 1, arf_signed = 1,
       room_privacy = CASE WHEN room_privacy = '' THEN 'private' ELSE room_privacy END
     WHERE first_name = 'Amelia' AND last_name = 'Hart'`,
  ).run();
}

function backfillCindyOccupancyFields() {
  const db = getDb();
  db.prepare(
    `UPDATE people SET
       currency = CASE WHEN currency = '' OR currency IS NULL THEN 'ZAR' ELSE currency END,
       contact_method = CASE WHEN contact_method = '' THEN 'phone' ELSE contact_method END,
       assigned_to_user_id = CASE WHEN assigned_to_user_id = '' THEN 'user_admissions' ELSE assigned_to_user_id END,
       referral_owner_user_id = CASE WHEN referral_owner_user_id = '' THEN 'user_admissions' ELSE referral_owner_user_id END
     WHERE archived_at = ''`,
  ).run();
  db.prepare(
    `UPDATE people SET
       manor_phase = CASE WHEN manor_phase = '' THEN '1' ELSE manor_phase END,
       counsellor_user_id = CASE WHEN counsellor_user_id = '' THEN 'user_therapist' ELSE counsellor_user_id END,
       admission_date = CASE WHEN admission_date = '' THEN substr(admitted_at, 1, 10) ELSE admission_date END
     WHERE stage = 'resident' AND house = 'manor' AND archived_at = ''`,
  ).run();
  db.prepare(
    `UPDATE people SET
       counsellor_user_id = CASE WHEN counsellor_user_id = '' THEN 'user_therapist' ELSE counsellor_user_id END,
       admission_date = CASE WHEN admission_date = '' THEN substr(admitted_at, 1, 10) ELSE admission_date END
     WHERE stage = 'resident' AND house = 'lodge' AND archived_at = ''`,
  ).run();
  db.prepare(
    `UPDATE people SET
       preferred_room_id = CASE WHEN preferred_room_id = '' THEN 'manor-beech' ELSE preferred_room_id END,
       assessment_details = CASE WHEN assessment_details = '' THEN 'Assessment done with family present.' ELSE assessment_details END,
       assessment_notes = CASE WHEN assessment_notes = '' THEN 'Recommend Manor Phase 1; shared room OK.' ELSE assessment_notes END,
       contact_method = CASE WHEN contact_method = '' THEN 'whatsapp' ELSE contact_method END,
       admission_date = CASE WHEN admission_date = '' THEN '2026-09-22' ELSE admission_date END
     WHERE first_name = 'Noah' AND last_name = 'Botha'`,
  ).run();
}

function backfillHandoffIds() {
  const rows = getDb()
    .prepare(`SELECT * FROM people WHERE stage = 'resident' AND archived_at = ''`)
    .all() as Person[];
  for (const row of rows) {
    const within_client_id = row.within_client_id || `reach-${row.id}`;
    const admission_kind = row.admission_kind || "program";
    const within_handoff_status = row.within_handoff_status === "stub_ready" ? "pack_ready" : row.within_handoff_status;
    if (
      within_client_id === row.within_client_id &&
      admission_kind === row.admission_kind &&
      within_handoff_status === row.within_handoff_status
    ) {
      continue;
    }
    replacePerson({
      ...row,
      within_client_id,
      admission_kind,
      within_handoff_status,
    });
  }
}

export function seedLeadSources(): LeadSource[] {
  return ["family", "self", "gp", "website", "referral_partner", "other"];
}

export function seedStages(): Stage[] {
  return ["enquiry", "next_steps", "approval", "admit", "resident"];
}
