import { writeAudit } from "./audit";
import { assertCommercialPatch, LEAD_SOURCE_SAFE_FIELDS } from "./field-gate";
import { newId } from "./passwords";
import { getPerson, insertPerson, replacePerson, roomOccupant } from "./people";
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
    contact_method: partial.contact_method ?? "",
    assigned_to_user_id: partial.assigned_to_user_id ?? "",
    counsellor_user_id: partial.counsellor_user_id ?? "",
    referral_owner_user_id: partial.referral_owner_user_id ?? "",
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
  action: "field_edit" | "lead_source" | "stage_move" | "house_assignment" | "archive" | "admit",
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
) {
  return applyPersonPatch(id, { lead_source, lead_source_note }, actor, "lead_source", "Updated lead source");
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
    const occupant = roomOccupant(roomId);
    if (occupant && occupant.id !== id) {
      return { ok: false as const, error: `${occupant.first_name} ${occupant.last_name} already has that room.` };
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

export function archivePerson(id: string, actor: User) {
  return applyPersonPatch(
    id,
    { stage: "archived", archived_at: nowIso(), house: "", room_id: "" },
    actor,
    "archive",
    "Archived enquiry",
  );
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
  } = {},
) {
  const current = getPerson(id);
  if (!current) return { ok: false as const, error: "Person not found." };
  if (current.stage !== "admit") {
    return { ok: false as const, error: "Only people on Admit can be confirmed into a house." };
  }
  if (!checklistComplete(current)) {
    return { ok: false as const, error: "Finish the commercial checklist before confirming admit." };
  }
  if (!ADMISSION_KINDS.includes(admissionKind as AdmissionKind)) {
    return { ok: false as const, error: "Choose program or detox / containment before confirming admit." };
  }
  const room = getRoom(roomId);
  if (!room) return { ok: false as const, error: "Choose a vacant room." };
  const occupant = roomOccupant(roomId);
  if (occupant && occupant.id !== id) {
    return { ok: false as const, error: `${occupant.first_name} ${occupant.last_name} already has ${room.name}.` };
  }

  let manor_phase: ManorPhase | "" = "";
  if (room.house === "manor") {
    if (!MANOR_PHASES.includes(options.manorPhase as ManorPhase)) {
      return { ok: false as const, error: "Choose Manor Phase 1 or Phase 2 before confirming admit." };
    }
    manor_phase = options.manorPhase as ManorPhase;
  }

  const kind = admissionKind as AdmissionKind;
  const houseName = room.house === "manor" ? "Manor" : "Lodge";
  const kindLabel = kind === "detox_containment" ? "detox / containment" : "program";
  const phaseBit =
    room.house === "manor" ? ` · Phase ${manor_phase}` : room.house === "lodge" ? " · Phase 3" : "";
  const admission_date = options.admissionDate || current.admission_date || nowIso().slice(0, 10);
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
    },
    actor,
    "admit",
    `Confirmed admit to ${houseName} room ${room.name}${phaseBit} · Within admission pack (${kindLabel})`,
  );
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
