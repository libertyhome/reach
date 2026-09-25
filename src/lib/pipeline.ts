import { writeAudit } from "./audit";
import { assertCommercialPatch, LEAD_SOURCE_SAFE_FIELDS } from "./field-gate";
import { admissionSummary, isNotConvertedReason } from "./labels";
import { newId } from "./passwords";
import { getPerson, insertPerson, replacePerson, roomHasSpace } from "./people";
import { getRoom } from "./rooms";
import { withinClientIdFor } from "./handoff";
import {
  ADMISSION_KINDS,
  COMMERCIAL_CHECKLIST,
  MANOR_PHASES,
  type AdmissionKind,
  type ContactMethod,
  type LeadSource,
  type ManorPhase,
  type Person,
  type Stage,
  type User,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function blankPerson(partial: Partial<Person> & Pick<Person, "first_name" | "last_name" | "stage">): Person {
  const now = nowIso();
  return {
    id: partial.id ?? newId("p"),
    first_name: partial.first_name,
    last_name: partial.last_name,
    preferred_name: partial.preferred_name ?? "",
    email: partial.email ?? "",
    phone: partial.phone ?? "",
    enquiry_date: partial.enquiry_date ?? now.slice(0, 10),
    lead_source: partial.lead_source ?? "other",
    lead_source_note: partial.lead_source_note ?? "",
    lead_source_who: partial.lead_source_who ?? "",
    caller_name: partial.caller_name ?? "",
    resident_name: partial.resident_name ?? "",
    contact_method: partial.contact_method ?? "",
    assigned_to_user_id: partial.assigned_to_user_id ?? "",
    counsellor_user_id: partial.counsellor_user_id ?? "",
    referral_owner_user_id: partial.referral_owner_user_id ?? "",
    referrer_name: partial.referrer_name ?? "",
    referrer_contact_person: partial.referrer_contact_person ?? "",
    referrer_phone: partial.referrer_phone ?? "",
    next_of_kin_name: partial.next_of_kin_name ?? "",
    next_of_kin_phone: partial.next_of_kin_phone ?? "",
    arp_email: partial.arp_email ?? "",
    funding_type: partial.funding_type ?? "private",
    funding_notes: partial.funding_notes ?? "",
    currency: partial.currency ?? "ZAR",
    expected_arrival: partial.expected_arrival ?? "",
    admission_date: partial.admission_date ?? "",
    planned_discharge_date: partial.planned_discharge_date ?? "",
    house_preference: partial.house_preference ?? "",
    preferred_room_id: partial.preferred_room_id ?? "",
    commercial_notes: partial.commercial_notes ?? "",
    not_converted_reason: partial.not_converted_reason ?? "",
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
    addon_nursing_days: partial.addon_nursing_days ?? 0,
    addon_psych_admission: partial.addon_psych_admission ?? 0,
    addon_overnight_supervision: partial.addon_overnight_supervision ?? 0,
    addon_medical_visa: partial.addon_medical_visa ?? 0,
    addon_detox_overnight: partial.addon_detox_overnight ?? 0,
    addon_detox_overnight_days: partial.addon_detox_overnight_days ?? 0,
    transfer_extension_status: partial.transfer_extension_status ?? "",
    transfer_extension_notes: partial.transfer_extension_notes ?? "",
    within_handoff_status: partial.within_handoff_status ?? "none",
    within_client_id: partial.within_client_id ?? "",
    admission_kind: partial.admission_kind ?? "",
    detox_first: partial.detox_first ?? 0,
    expected_detox_nights: partial.expected_detox_nights ?? 0,
    within_waiting_status: partial.within_waiting_status ?? "",
    within_sent_at: partial.within_sent_at ?? "",
    within_sent_by_name: partial.within_sent_by_name ?? "",
    within_sent_by_user_id: partial.within_sent_by_user_id ?? "",
    within_waiting_id: partial.within_waiting_id ?? "",
    admitted_at: partial.admitted_at ?? "",
    archived_at: partial.archived_at ?? "",
    created_at: partial.created_at ?? now,
    updated_at: now,
  };
}

export function createEnquiry(
  input: {
    first_name: string;
    last_name: string;
    preferred_name?: string;
    email?: string;
    phone?: string;
    lead_source?: LeadSource;
    lead_source_note?: string;
    lead_source_who?: string;
    caller_name?: string;
    resident_name?: string;
    contact_method?: ContactMethod | "";
    assigned_to_user_id?: string;
    referral_owner_user_id?: string;
    referrer_name?: string;
    referrer_contact_person?: string;
    referrer_phone?: string;
    commercial_notes?: string;
  },
  actor: User,
) {
  const person = blankPerson({
    ...input,
    assigned_to_user_id: input.assigned_to_user_id || actor.id,
    referral_owner_user_id: input.referral_owner_user_id || actor.id,
    stage: "enquiry",
  });
  insertPerson(person);
  const event = writeAudit({
    personId: person.id,
    action: "create",
    summary: `Opened enquiry for ${person.first_name} ${person.last_name}`,
    actorId: actor.id,
    before: null,
    after: person,
  });
  return { person, event };
}

export function applyPersonPatch(
  id: string,
  patch: Partial<Person>,
  actor: User,
  action: "field_edit" | "lead_source" | "stage_move" | "house_assignment" | "archive" | "admit" | "within_send",
  summary: string,
) {
  const current = getPerson(id);
  if (!current) return { ok: false as const, error: "Person not found." };

  assertCommercialPatch(patch as Record<string, unknown>);

  if (action === "lead_source") {
    const extra = Object.keys(patch).filter(
      (key) => !LEAD_SOURCE_SAFE_FIELDS.includes(key as (typeof LEAD_SOURCE_SAFE_FIELDS)[number]),
    );
    if (extra.length > 0) {
      throw new Error("Lead source cannot change stage, archive, or house.");
    }
  }

  const next: Person = {
    ...current,
    ...patch,
    id: current.id,
    created_at: current.created_at,
    updated_at: nowIso(),
  };

  const detoxError = detoxStateError(next);
  if (detoxError) return { ok: false as const, error: detoxError };

  if (action === "lead_source") {
    next.stage = current.stage;
    next.archived_at = current.archived_at;
    next.house = current.house;
    next.room_id = current.room_id;
  }

  replacePerson(next);
  const event = writeAudit({
    personId: id,
    action,
    summary,
    actorId: actor.id,
    before: current,
    after: next,
  });
  return { ok: true as const, person: next, event };
}

export function moveStage(id: string, stage: Stage, actor: User) {
  if (stage === "resident") {
    return { ok: false as const, error: "Use Admit confirm to place someone in a house." };
  }
  if (stage === "archived") {
    return archivePerson(id, actor);
  }
  const current = getPerson(id);
  if (!current) return { ok: false as const, error: "Person not found." };
  return applyPersonPatch(
    id,
    { stage, archived_at: "" },
    actor,
    "stage_move",
    `Moved to ${stageLabel(stage)}`,
  );
}

export function updateLeadSource(
  id: string,
  lead_source: LeadSource,
  lead_source_note: string,
  actor: User,
  lead_source_who = "",
) {
  return applyPersonPatch(
    id,
    { lead_source, lead_source_note, lead_source_who },
    actor,
    "lead_source",
    "Updated lead source",
  );
}

export function assignHouse(
  id: string,
  house: Person["house"],
  roomId: string,
  actor: User,
  roomPrivacy: Person["room_privacy"] = "",
) {
  if (roomId) {
    const room = getRoom(roomId);
    if (!room) return { ok: false as const, error: "Room not found." };
    if (house && room.house !== house) {
      return { ok: false as const, error: "That room is not in the selected house." };
    }
    if (!roomHasSpace(room, id)) {
      const beds = room.capacity || 1;
      return {
        ok: false as const,
        error: `${room.name} is full (${beds} ${beds === 1 ? "bed" : "beds"}).`,
      };
    }
    house = room.house;
  }
  const privacy =
    roomPrivacy === "shared" || roomPrivacy === "private" ? roomPrivacy : ("" as Person["room_privacy"]);
  const privacyBit = privacy ? ` · ${privacy}` : "";
  const summary = roomId
    ? `Assigned ${house} room${privacyBit}`
    : house
      ? `Set house to ${house}${privacyBit}`
      : "Cleared house assignment";
  return applyPersonPatch(
    id,
    { house, room_id: roomId, room_privacy: privacy },
    actor,
    "house_assignment",
    summary,
  );
}

/** Draft preference before Admit — does not place on a house board. */
export function saveRoomPreference(
  id: string,
  housePreference: Person["house_preference"],
  preferredRoomId: string,
  roomPrivacy: Person["room_privacy"],
  actor: User,
) {
  if (preferredRoomId) {
    const room = getRoom(preferredRoomId);
    if (!room) return { ok: false as const, error: "Preferred room not found." };
    if (
      housePreference === "manor" ||
      housePreference === "lodge"
        ? room.house !== housePreference
        : false
    ) {
      return { ok: false as const, error: "Preferred room must match the preferred house." };
    }
    if (!housePreference || housePreference === "either") {
      housePreference = room.house;
    }
  }
  const privacy =
    roomPrivacy === "shared" || roomPrivacy === "private" ? roomPrivacy : ("" as Person["room_privacy"]);
  const summary = preferredRoomId
    ? `Saved preferred room${privacy ? ` · ${privacy}` : ""}`
    : housePreference
      ? `Saved house preference (${housePreference})`
      : "Cleared room preference";
  return applyPersonPatch(
    id,
    {
      house_preference: housePreference,
      preferred_room_id: preferredRoomId,
      room_privacy: privacy,
    },
    actor,
    "field_edit",
    summary,
  );
}

export function archivePerson(id: string, actor: User, reason = "") {
  const patch: Partial<Person> = { stage: "archived", archived_at: nowIso(), house: "", room_id: "" };
  if (isNotConvertedReason(reason)) patch.not_converted_reason = reason;
  return applyPersonPatch(id, patch, actor, "archive", "Archived enquiry");
}

export function checklistComplete(person: Person) {
  return COMMERCIAL_CHECKLIST.every((item) => person[item.key] === 1);
}

export function confirmAdmit(
  id: string,
  roomId: string,
  admissionKind: string,
  actor: User,
  options: {
    manorPhase?: string;
    counsellorUserId?: string;
    admissionDate?: string;
    plannedDischargeDate?: string;
    /** "1" / "yes" when treatment needs detox before the programme. Short stay rejects this. */
    detoxFirst?: string;
    /** Whole nights, "1"–"5", required when detoxFirst is yes. */
    expectedDetoxNights?: string;
  } = {},
) {
  const current = getPerson(id);
  if (!current) return { ok: false as const, error: "Person not found." };
  if (current.stage !== "admit") {
    return { ok: false as const, error: "Only people on Admit can be confirmed into a house." };
  }
  if (!checklistComplete(current)) {
    return { ok: false as const, error: "Finish the admissions checklist before confirming admit." };
  }
  if (!ADMISSION_KINDS.includes(admissionKind as AdmissionKind)) {
    return { ok: false as const, error: "Choose Treatment or Short stay before confirming admit." };
  }
  const room = getRoom(roomId);
  if (!room) return { ok: false as const, error: "Choose a vacant room." };
  if (!roomHasSpace(room, id)) {
    const beds = room.capacity || 1;
    return {
      ok: false as const,
      error: `${room.name} is full (${beds} ${beds === 1 ? "bed" : "beds"}).`,
    };
  }

  let manor_phase: ManorPhase | "" = "";
  if (room.house === "manor") {
    if (!MANOR_PHASES.includes(options.manorPhase as ManorPhase)) {
      return { ok: false as const, error: "Choose Manor Phase 1 or Phase 2 before confirming admit." };
    }
    manor_phase = options.manorPhase as ManorPhase;
  }

  const kind = admissionKind as AdmissionKind;
  const detox = resolveDetoxOnAdmit(kind, options.detoxFirst, options.expectedDetoxNights, current);
  if (!detox.ok) return detox;

  const houseName = room.house === "manor" ? "Manor" : "Lodge";
  const phaseBit =
    room.house === "manor" ? ` · Phase ${manor_phase}` : room.house === "lodge" ? " · Phase 3" : "";
  const admission_date = options.admissionDate || current.admission_date || nowIso().slice(0, 10);
  const summaryKind = admissionSummary({
    admission_kind: kind,
    detox_first: detox.detox_first,
    expected_detox_nights: detox.expected_detox_nights,
  });
  return applyPersonPatch(
    id,
    {
      stage: "resident",
      house: room.house,
      room_id: room.id,
      preferred_room_id: current.preferred_room_id || room.id,
      house_preference: room.house,
      manor_phase,
      counsellor_user_id: options.counsellorUserId || current.counsellor_user_id || "",
      admission_date,
      planned_discharge_date: options.plannedDischargeDate ?? current.planned_discharge_date,
      admitted_at: nowIso(),
      archived_at: "",
      within_handoff_status: "pack_ready",
      within_client_id: current.within_client_id || withinClientIdFor(current.id),
      admission_kind: kind,
      detox_first: detox.detox_first,
      expected_detox_nights: detox.expected_detox_nights,
    },
    actor,
    "admit",
    `Confirmed admit to ${houseName} room ${room.name}${phaseBit} · Within admission pack (${summaryKind})`,
  );
}

export function parseDetoxDays(raw: string | undefined | null) {
  const text = String(raw ?? "").trim();
  if (!/^[1-5]$/.test(text)) return null;
  return Number(text);
}

/** 0 means the add-on is on but days were not recorded. null is an out-of-range value. */
export function parseAddonDays(raw: string | undefined | null) {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "0") return 0;
  if (!/^(?:[1-9]|1[0-4])$/.test(text)) return null;
  return Number(text);
}

/** Days already saved on the Detox commercial add-on, or 0 when it is off. */
export function savedDetoxDays(person: Pick<Person, "detox_first" | "expected_detox_nights">) {
  if (person.detox_first !== 1) return 0;
  return parseDetoxDays(String(person.expected_detox_nights)) ?? 0;
}

/**
 * Treatment may start with detox and continue into the programme on this admit.
 * Short stay is detox-only / brief. A saved Detox day count is not replaced with 0.
 */
function resolveDetoxOnAdmit(
  kind: AdmissionKind,
  detoxFirstRaw: string | undefined,
  nightsRaw: string | undefined,
  current: Person,
) {
  const saved = savedDetoxDays(current);
  const yes = detoxFirstRaw === "1" || detoxFirstRaw === "yes";

  if (kind === "detox_containment") {
    if (saved > 0) {
      return {
        ok: false as const,
        error: `Detox add-on is set to ${saved} ${saved === 1 ? "day" : "days"}. Choose Treatment so that count is sent to Within, or turn Detox off for a short stay.`,
      };
    }
    if (yes) {
      return {
        ok: false as const,
        error: "Short stay is detox-only. Choose Treatment if they continue into the programme after detox.",
      };
    }
    return { ok: true as const, detox_first: 0, expected_detox_nights: 0 };
  }

  const no = detoxFirstRaw === "0" || detoxFirstRaw === "no";
  if (!yes && !no) {
    return { ok: false as const, error: "Answer whether they need detox first before confirming admit." };
  }

  if (saved > 0) {
    if (!yes) {
      return {
        ok: false as const,
        error: `Detox add-on is set to ${saved} ${saved === 1 ? "day" : "days"}. Confirm those days on this admit so Within gets the same count, or turn Detox off in commercial add-ons.`,
      };
    }
    const submitted = parseDetoxDays(nightsRaw);
    if (submitted == null) {
      return { ok: false as const, error: "Detox days must be from 1 to 5." };
    }
    if (submitted !== saved) {
      return {
        ok: false as const,
        error: `Detox add-on is set to ${saved} ${saved === 1 ? "day" : "days"}. Confirm admit with ${saved} ${saved === 1 ? "day" : "days"} so Within receives that count.`,
      };
    }
    return { ok: true as const, detox_first: 1, expected_detox_nights: saved };
  }

  if (!yes) return { ok: true as const, detox_first: 0, expected_detox_nights: 0 };

  const submitted = parseDetoxDays(nightsRaw);
  if (submitted == null) {
    return { ok: false as const, error: "Detox days must be from 1 to 5." };
  }
  return { ok: true as const, detox_first: 1, expected_detox_nights: submitted };
}

function detoxStateError(person: Person) {
  const days = parseDetoxDays(String(person.expected_detox_nights));
  const on = person.detox_first === 1;
  if (on && days == null) return "Detox add-on needs a day count from 1 to 5.";
  if (!on && Number(person.expected_detox_nights)) {
    return "Detox days stay on the file only while the Detox add-on is on.";
  }
  if (on && person.admission_kind === "detox_containment") {
    return "Short stay cannot include the Detox add-on. Choose Treatment so the day count is sent to Within, or turn Detox off.";
  }
  return null;
}

function stageLabel(stage: Stage) {
  switch (stage) {
    case "enquiry":
      return "Enquiries";
    case "next_steps":
      return "Next Steps";
    case "approval":
      return "Account and Clinical Approval";
    case "admit":
      return "Admit";
    case "resident":
      return "Resident";
    case "archived":
      return "Archived";
  }
}
