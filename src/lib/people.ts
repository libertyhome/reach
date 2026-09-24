import { getDb } from "./db";
import type { House, Person, Stage } from "./types";

const PERSON_COLUMNS = `
  id, first_name, last_name, preferred_name, email, phone, enquiry_date,
  lead_source, lead_source_note, contact_method, assigned_to_user_id, counsellor_user_id,
  referral_owner_user_id, referrer_name, referrer_contact_person, referrer_phone,
  next_of_kin_name, next_of_kin_phone,
  funding_type, funding_notes, currency, expected_arrival, admission_date, planned_discharge_date,
  house_preference, preferred_room_id, commercial_notes, assessment_details, assessment_notes,
  stage, house, room_id, room_privacy, manor_phase, accounts_approved, clinical_approved, deposit_received,
  arp_signed, arf_signed, funding_confirmed, admission_date_agreed, room_offered,
  addon_medical_float, addon_nursing_medical_admission, addon_psych_admission, addon_overnight_supervision,
  transfer_extension_status, transfer_extension_notes,
  within_handoff_status, within_client_id, admission_kind, detox_first, expected_detox_nights,
  admitted_at, archived_at, created_at, updated_at
`;

function withDefaults(person: Person): Person {
  return {
    ...person,
    contact_method: person.contact_method ?? "",
    assigned_to_user_id: person.assigned_to_user_id ?? "",
    counsellor_user_id: person.counsellor_user_id ?? "",
    referral_owner_user_id: person.referral_owner_user_id ?? "",
    referrer_name: person.referrer_name ?? "",
    referrer_contact_person: person.referrer_contact_person ?? "",
    referrer_phone: person.referrer_phone ?? "",
    currency: person.currency ?? "ZAR",
    admission_date: person.admission_date ?? "",
    planned_discharge_date: person.planned_discharge_date ?? "",
    preferred_room_id: person.preferred_room_id ?? "",
    assessment_details: person.assessment_details ?? "",
    assessment_notes: person.assessment_notes ?? "",
    room_privacy: person.room_privacy ?? "",
    manor_phase: person.manor_phase ?? "",
    arp_signed: person.arp_signed ?? 0,
    arf_signed: person.arf_signed ?? 0,
    addon_medical_float: person.addon_medical_float ?? 0,
    addon_nursing_medical_admission: person.addon_nursing_medical_admission ?? 0,
    addon_psych_admission: person.addon_psych_admission ?? 0,
    addon_overnight_supervision: person.addon_overnight_supervision ?? 0,
    transfer_extension_status: person.transfer_extension_status ?? "",
    transfer_extension_notes: person.transfer_extension_notes ?? "",
    within_client_id: person.within_client_id ?? "",
    admission_kind: person.admission_kind ?? "",
    detox_first: person.detox_first === 1 ? 1 : 0,
    expected_detox_nights: normalizeDetoxNights(person.expected_detox_nights),
  };
}

function normalizeDetoxNights(value: number | undefined) {
  const nights = Number(value);
  if (!Number.isInteger(nights) || nights < 0 || nights > 5) return 0;
  return nights;
}

export function listAdmitQueue(): Person[] {
  return listPeopleByStage("admit");
}

export function listPeople(): Person[] {
  return getDb()
    .prepare(`SELECT * FROM people ORDER BY last_name ASC, first_name ASC`)
    .all() as Person[];
}

export function listPeopleByStage(stage: Stage): Person[] {
  return getDb()
    .prepare(
      `SELECT * FROM people WHERE stage = ? AND archived_at = '' ORDER BY updated_at DESC, last_name ASC`,
    )
    .all(stage) as Person[];
}

export function listResidents(house: House): Person[] {
  return getDb()
    .prepare(
      `SELECT * FROM people
       WHERE stage = 'resident' AND house = ? AND archived_at = ''
       ORDER BY last_name ASC`,
    )
    .all(house) as Person[];
}

export function listArchived(): Person[] {
  return getDb()
    .prepare(`SELECT * FROM people WHERE stage = 'archived' OR archived_at != '' ORDER BY archived_at DESC`)
    .all() as Person[];
}

export function getPerson(id: string): Person | null {
  return (getDb().prepare(`SELECT * FROM people WHERE id = ?`).get(id) as Person | undefined) ?? null;
}

export function findPersonByName(first: string, last: string): Person | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM people WHERE first_name = ? AND last_name = ?`)
      .get(first, last) as Person | undefined) ?? null
  );
}

export function insertPerson(person: Person) {
  const row = withDefaults(person);
  getDb()
    .prepare(
      `INSERT INTO people (
        ${PERSON_COLUMNS}
      ) VALUES (
        @id, @first_name, @last_name, @preferred_name, @email, @phone, @enquiry_date,
        @lead_source, @lead_source_note, @contact_method, @assigned_to_user_id, @counsellor_user_id,
        @referral_owner_user_id, @referrer_name, @referrer_contact_person, @referrer_phone,
        @next_of_kin_name, @next_of_kin_phone,
        @funding_type, @funding_notes, @currency, @expected_arrival, @admission_date, @planned_discharge_date,
        @house_preference, @preferred_room_id, @commercial_notes, @assessment_details, @assessment_notes,
        @stage, @house, @room_id, @room_privacy, @manor_phase, @accounts_approved, @clinical_approved, @deposit_received,
        @arp_signed, @arf_signed, @funding_confirmed, @admission_date_agreed, @room_offered,
        @addon_medical_float, @addon_nursing_medical_admission, @addon_psych_admission, @addon_overnight_supervision,
        @transfer_extension_status, @transfer_extension_notes,
        @within_handoff_status, @within_client_id, @admission_kind, @detox_first, @expected_detox_nights,
        @admitted_at, @archived_at, @created_at, @updated_at
      )`,
    )
    .run(row);
}

export function replacePerson(person: Person) {
  const row = withDefaults(person);
  getDb()
    .prepare(
      `UPDATE people SET
      first_name = @first_name,
      last_name = @last_name,
      preferred_name = @preferred_name,
      email = @email,
      phone = @phone,
      enquiry_date = @enquiry_date,
      lead_source = @lead_source,
      lead_source_note = @lead_source_note,
      contact_method = @contact_method,
      assigned_to_user_id = @assigned_to_user_id,
      counsellor_user_id = @counsellor_user_id,
      referral_owner_user_id = @referral_owner_user_id,
      referrer_name = @referrer_name,
      referrer_contact_person = @referrer_contact_person,
      referrer_phone = @referrer_phone,
      next_of_kin_name = @next_of_kin_name,
      next_of_kin_phone = @next_of_kin_phone,
      funding_type = @funding_type,
      funding_notes = @funding_notes,
      currency = @currency,
      expected_arrival = @expected_arrival,
      admission_date = @admission_date,
      planned_discharge_date = @planned_discharge_date,
      house_preference = @house_preference,
      preferred_room_id = @preferred_room_id,
      commercial_notes = @commercial_notes,
      assessment_details = @assessment_details,
      assessment_notes = @assessment_notes,
      stage = @stage,
      house = @house,
      room_id = @room_id,
      room_privacy = @room_privacy,
      manor_phase = @manor_phase,
      accounts_approved = @accounts_approved,
      clinical_approved = @clinical_approved,
      deposit_received = @deposit_received,
      arp_signed = @arp_signed,
      arf_signed = @arf_signed,
      funding_confirmed = @funding_confirmed,
      admission_date_agreed = @admission_date_agreed,
      room_offered = @room_offered,
      addon_medical_float = @addon_medical_float,
      addon_nursing_medical_admission = @addon_nursing_medical_admission,
      addon_psych_admission = @addon_psych_admission,
      addon_overnight_supervision = @addon_overnight_supervision,
      transfer_extension_status = @transfer_extension_status,
      transfer_extension_notes = @transfer_extension_notes,
      within_handoff_status = @within_handoff_status,
      within_client_id = @within_client_id,
      admission_kind = @admission_kind,
      detox_first = @detox_first,
      expected_detox_nights = @expected_detox_nights,
      admitted_at = @admitted_at,
      archived_at = @archived_at,
      updated_at = @updated_at
    WHERE id = @id`,
    )
    .run(row);
}

export function roomOccupant(roomId: string): Person | null {
  if (!roomId) return null;
  return (
    (getDb()
      .prepare(
        `SELECT * FROM people
         WHERE room_id = ? AND stage = 'resident' AND archived_at = ''
         LIMIT 1`,
      )
      .get(roomId) as Person | undefined) ?? null
  );
}

export function occupancyCounts() {
  const rows = getDb()
    .prepare(
      `SELECT house, COUNT(*) as count
       FROM people
       WHERE stage = 'resident' AND archived_at = '' AND house IN ('manor', 'lodge')
       GROUP BY house`,
    )
    .all() as { house: House; count: number }[];
  const manor = rows.find((row) => row.house === "manor")?.count ?? 0;
  const lodge = rows.find((row) => row.house === "lodge")?.count ?? 0;
  return { manor, lodge };
}

export function listResidentsForPack(house?: House): Person[] {
  if (house) return listResidents(house);
  return getDb()
    .prepare(
      `SELECT * FROM people
       WHERE stage = 'resident' AND archived_at = '' AND house IN ('manor', 'lodge')
       ORDER BY house ASC, last_name ASC`,
    )
    .all() as Person[];
}

export function countByStage() {
  const rows = getDb()
    .prepare(`SELECT stage, COUNT(*) as count FROM people WHERE archived_at = '' GROUP BY stage`)
    .all() as { stage: Stage; count: number }[];
  return Object.fromEntries(rows.map((row) => [row.stage, row.count])) as Partial<Record<Stage, number>>;
}
