import { HOUSE_LABEL, leadSourceLabel, personDisplayName } from "./labels";
import { getRoom } from "./rooms";
import { findUserById } from "./users";
import {
  CONTACT_METHOD_LABEL,
  type ContactMethod,
  type Person,
  type ProgramPhase,
} from "./types";

/** Resolve program phase for occupancy / Within: Lodge = 3, Manor = chosen 1 or 2. */
export function programPhaseFor(person: Person): ProgramPhase | "" {
  if (person.house === "lodge") return "3";
  if (person.house === "manor") {
    return person.manor_phase === "2" ? "2" : person.manor_phase === "1" ? "1" : "";
  }
  if (person.house_preference === "lodge") return "3";
  if (person.manor_phase === "1" || person.manor_phase === "2") return person.manor_phase;
  return "";
}

export function facilityFor(person: Person): Person["house"] | Person["house_preference"] {
  if (person.house) return person.house;
  if (person.house_preference === "manor" || person.house_preference === "lodge") {
    return person.house_preference;
  }
  return "";
}

/** Flattened row for daily enriched occupancy email parity. */
export function occupancyParityRow(person: Person) {
  const room = person.room_id ? getRoom(person.room_id) : null;
  const preferred = person.preferred_room_id ? getRoom(person.preferred_room_id) : null;
  const assignee = person.assigned_to_user_id ? findUserById(person.assigned_to_user_id) : null;
  const counsellor = person.counsellor_user_id ? findUserById(person.counsellor_user_id) : null;
  const referralOwner = person.referral_owner_user_id
    ? findUserById(person.referral_owner_user_id)
    : null;
  const facility = facilityFor(person);
  const phase = programPhaseFor(person);
  const contact =
    person.contact_method && person.contact_method in CONTACT_METHOD_LABEL
      ? CONTACT_METHOD_LABEL[person.contact_method as ContactMethod]
      : person.contact_method || "";

  return {
    name: personDisplayName(person),
    lead_source: leadSourceLabel(person.lead_source),
    method_of_contact: contact,
    referrer: person.referrer_name,
    referrer_contact_person: person.referrer_contact_person,
    referrer_phone: person.referrer_phone,
    referral_owner: referralOwner?.name ?? "",
    assigned_to: assignee?.name ?? "",
    counsellor: counsellor?.name ?? "",
    admission_date: person.admission_date || (person.admitted_at || "").slice(0, 10),
    planned_discharge_date: person.planned_discharge_date,
    facility: facility ? (facility === "manor" || facility === "lodge" ? HOUSE_LABEL[facility] : facility) : "",
    phase: phase ? `Phase ${phase}` : "",
    room: room?.name ?? "",
    preferred_room: preferred?.name ?? "",
    currency: person.currency,
  };
}
