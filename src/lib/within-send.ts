import { canSendToWithin } from "./access";
import { writeAudit } from "./audit";
import { listDocuments } from "./documents";
import { PACK_BUTTONS, handoffSecret, withinBaseUrl, withinClientIdFor } from "./handoff";
import { HOUSE_LABEL } from "./labels";
import { findUserById } from "./users";
import { getPerson, replacePerson } from "./people";
import { getRoom } from "./rooms";
import type { AdmissionKind, House, Person, PersonDocument, ProgramPhase, User } from "./types";

/**
 * Commercial pass-off into Within's "Waiting to be admitted" list.
 * Version 2 of POST /api/ingest/admission. The iPad pack token stays version 1.
 * Never log the handoff secret or the patient payload.
 */

export const WITHIN_HOUSE = {
  manor: "weltevreden_manor",
  lodge: "liberty_lodge",
} as const;

export type WithinHouseId = (typeof WITHIN_HOUSE)[House];

const LODGE_ONLY = [
  { kind: "coc", label: "Code of conduct" },
  { kind: "passenger_indemnity", label: "Passenger indemnity" },
  { kind: "parking_indemnity", label: "Parking indemnity" },
  { kind: "visitors", label: "Visitors" },
] as const;

const MANOR_ONLY = [{ kind: "manor_coc", label: "Manor code of conduct" }] as const;

const LODGE_ONLY_KINDS = new Set<string>(LODGE_ONLY.map((item) => item.kind));
const MANOR_ONLY_KINDS = new Set<string>(MANOR_ONLY.map((item) => item.kind));

const KIND_ALIASES: Record<string, string> = {
  form_7: "form7",
  next_of_kin: "nok",
  next_of_kin_arp: "nok",
  manor_code_of_conduct: "manor_coc",
  code_of_conduct: "coc",
  visitors_policy: "visitors",
};

export type RequiredDocument = { kind: string; label: string };

export type AwaitingAdmissionBody = {
  v: 2;
  intent: "awaiting_admission";
  reachClientId: string;
  withinClientId?: string;
  house: WithinHouseId;
  phase: ProgramPhase;
  admissionKind: AdmissionKind;
  detoxFirst?: boolean;
  expectedDetoxNights?: number;
  detoxIntent?: "none" | "detox_first" | "short_stay";
  firstName: string;
  lastName: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  admissionDate?: string;
  plannedDeparture?: string;
  fundingType?: string;
  room?: string;
  counsellor?: string;
  referrer?: { name?: string; organisation?: string; phone?: string };
  nextOfKin?: { name?: string; phone?: string };
  documentsComplete: boolean;
  documents?: {
    id: string;
    kind: string;
    title: string;
    filename: string;
    reachPath: string;
    signed: boolean;
  }[];
  sentBy: { name: string; email: string; reachUserId: string };
  sentAt: string;
};

export type WithinPostResult =
  | {
      ok: true;
      created: boolean;
      updated: boolean;
      id: string;
      withinClientId: string;
      status: "awaiting_admission";
      documentsComplete: boolean;
    }
  | { ok: false; code: string; error: string; clientId?: string };

type FetchLike = typeof fetch;

export function requiredDocumentsFor(house: House): RequiredDocument[] {
  const shared = [
    ...PACK_BUTTONS.map((button) => ({ kind: button.slug, label: button.label })),
    { kind: "laundry_indemnity", label: "Laundry indemnity" },
  ];
  if (house === "lodge") return [...shared, ...LODGE_ONLY];
  return [...shared, ...MANOR_ONLY];
}

export function reachHouseFor(
  person: Pick<Person, "house" | "house_preference" | "preferred_room_id" | "room_id">,
): House | null {
  const confirmed = person.house === "manor" || person.house === "lodge" ? person.house : "";
  const assignedRoom = person.room_id ? getRoom(person.room_id) : null;
  if (confirmed) {
    if (assignedRoom && assignedRoom.house !== confirmed) return null;
    return confirmed;
  }

  const preference =
    person.house_preference === "manor" || person.house_preference === "lodge" ? person.house_preference : "";
  const preferredRoom = person.preferred_room_id ? getRoom(person.preferred_room_id) : null;
  const drafts = [preference, preferredRoom?.house ?? "", assignedRoom?.house ?? ""].filter(
    (value): value is House => value === "manor" || value === "lodge",
  );
  if (drafts.length === 0) return null;
  if (new Set(drafts).size > 1) return null;
  return drafts[0];
}

/** Lodge is always phase 3. Manor is phase 1 or 2, never 3. */
export function phaseForHouse(person: Pick<Person, "manor_phase">, house: House): ProgramPhase {
  if (house === "lodge") return "3";
  return person.manor_phase === "2" ? "2" : "1";
}

function canonicalKind(value: string) {
  const norm = value
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return KIND_ALIASES[norm] ?? norm;
}

function documentMatches(doc: PersonDocument, kind: string) {
  if (doc.for_within !== 1) return false;
  return [doc.kind, doc.title, doc.filename].some((value) => canonicalKind(value) === kind);
}

function satisfiedWithoutFile(person: Person, kind: string) {
  if (kind === "nok" && person.arp_signed === 1) return true;
  if (kind === "arf" && person.arf_signed === 1) return true;
  return false;
}

export function missingRequiredDocuments(person: Person, house: House, documents = listDocuments(person.id)) {
  return requiredDocumentsFor(house).filter(
    (item) => !satisfiedWithoutFile(person, item.kind) && !documents.some((doc) => documentMatches(doc, item.kind)),
  );
}

function documentAllowed(kind: string, house: House) {
  if (house === "manor" && LODGE_ONLY_KINDS.has(canonicalKind(kind))) return false;
  if (house === "lodge" && MANOR_ONLY_KINDS.has(canonicalKind(kind))) return false;
  return true;
}

function plannedRoomName(person: Person, house: House) {
  const assigned = person.room_id ? getRoom(person.room_id) : null;
  if (assigned?.house === house) return assigned.name;
  const preferred = person.preferred_room_id ? getRoom(person.preferred_room_id) : null;
  if (preferred?.house === house) return preferred.name;
  return "";
}

function dateOrEmpty(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/**
 * Detox fields travel together, matching the pack token.
 * A recorded 1–5 day count is kept. An inconsistent plan is refused.
 */
function detoxPlan(person: Person, admissionKind: AdmissionKind) {
  const rawNights = Number(person.expected_detox_nights);
  const nightsInRange = Number.isInteger(rawNights) && rawNights >= 1 && rawNights <= 5;
  const flagged = person.detox_first === 1;

  if (admissionKind === "detox_containment") {
    if (flagged || nightsInRange || rawNights > 0) return null;
    return { detoxFirst: false as const, expectedDetoxNights: 0, detoxIntent: "short_stay" as const };
  }
  if (flagged && !nightsInRange) return null;
  if (nightsInRange) {
    return { detoxFirst: true as const, expectedDetoxNights: rawNights, detoxIntent: "detox_first" as const };
  }
  return { detoxFirst: false as const, expectedDetoxNights: 0, detoxIntent: "none" as const };
}

export function buildAwaitingAdmission(
  person: Person,
  actor: Pick<User, "id" | "name" | "email">,
  now = new Date(),
  documents = listDocuments(person.id),
):
  | {
      ok: true;
      body: AwaitingAdmissionBody;
      house: House;
      missing: RequiredDocument[];
      documentsComplete: boolean;
    }
  | { ok: false; code: string; error: string } {
  if (!person.first_name.trim() || !person.last_name.trim()) {
    return { ok: false, code: "name_required", error: "First and last name are required before sending." };
  }
  const house = reachHouseFor(person);
  if (!house) {
    return {
      ok: false,
      code: "house_unknown",
      error: "House is unknown. Set Manor or Lodge before sending. Manor and Lodge are never sent together.",
    };
  }

  const admissionKind: AdmissionKind =
    person.admission_kind === "detox_containment" ? "detox_containment" : "program";
  const detox = detoxPlan(person, admissionKind);
  if (!detox) {
    return {
      ok: false,
      code: "detox_plan",
      error: "The detox plan does not match. Fix detox days before sending to Within.",
    };
  }

  const phase = phaseForHouse(person, house);
  const missing = missingRequiredDocuments(person, house, documents);
  const documentsComplete = missing.length === 0;
  const withinDocs = documents
    .filter((doc) => doc.for_within === 1 && documentAllowed(doc.kind, house))
    .slice(0, 40)
    .map((doc) => ({
      id: doc.id,
      kind: canonicalKind(doc.kind),
      title: doc.title,
      filename: doc.filename,
      reachPath: `/api/documents/${doc.id}`,
      signed: false,
    }));

  const body: AwaitingAdmissionBody = {
    v: 2,
    intent: "awaiting_admission",
    reachClientId: person.id,
    withinClientId: person.within_client_id || withinClientIdFor(person.id),
    house: WITHIN_HOUSE[house],
    phase,
    admissionKind,
    detoxFirst: detox.detoxFirst,
    expectedDetoxNights: detox.expectedDetoxNights,
    detoxIntent: detox.detoxIntent,
    firstName: person.first_name.trim(),
    lastName: person.last_name.trim(),
    documentsComplete,
    sentBy: {
      name: actor.name,
      email: actor.email,
      reachUserId: actor.id,
    },
    sentAt: now.toISOString(),
  };

  if (person.preferred_name.trim()) body.preferredName = person.preferred_name.trim();
  if (person.email.trim()) body.email = person.email.trim();
  if (person.phone.trim()) body.phone = person.phone.trim();
  const admissionDate = dateOrEmpty(person.admission_date || person.expected_arrival);
  if (admissionDate) body.admissionDate = admissionDate;
  const plannedDeparture = dateOrEmpty(person.planned_discharge_date);
  if (plannedDeparture) body.plannedDeparture = plannedDeparture;
  if (person.funding_type) body.fundingType = person.funding_type;
  const room = plannedRoomName(person, house);
  if (room) body.room = room;
  const counsellor = person.counsellor_user_id ? findUserById(person.counsellor_user_id) : null;
  if (counsellor?.name) body.counsellor = counsellor.name;

  const referrerName = person.referrer_contact_person.trim() || person.referrer_name.trim();
  const organisation = person.referrer_name.trim();
  if (referrerName || organisation || person.referrer_phone.trim()) {
    body.referrer = {};
    if (referrerName) body.referrer.name = referrerName;
    if (organisation) body.referrer.organisation = organisation;
    if (person.referrer_phone.trim()) body.referrer.phone = person.referrer_phone.trim();
  }

  if (person.next_of_kin_name.trim() || person.next_of_kin_phone.trim()) {
    body.nextOfKin = {};
    if (person.next_of_kin_name.trim()) body.nextOfKin.name = person.next_of_kin_name.trim();
    if (person.next_of_kin_phone.trim()) body.nextOfKin.phone = person.next_of_kin_phone.trim();
  }

  if (withinDocs.length) body.documents = withinDocs;

  return { ok: true, body, house, missing, documentsComplete };
}

export function staffMessageForWithinCode(code: string) {
  switch (code) {
    case "unauthorized":
      return "Within refused the handoff.";
    case "house_required":
    case "invalid_house":
      return "Within rejected the house. Manor and Lodge must stay separate.";
    case "documents_complete_required":
      return "Document completeness must be yes or no.";
    case "already_admitted":
      return "Already admitted in Within";
    case "detox_plan":
      return "The detox plan does not match. Fix detox days before sending to Within.";
    case "house_unknown":
      return "House is unknown. Set Manor or Lodge before sending. Manor and Lodge are never sent together.";
    default:
      return "Within did not accept the send.";
  }
}

function readCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

export async function postAwaitingAdmission(
  body: AwaitingAdmissionBody,
  options: { fetchImpl?: FetchLike; baseUrl?: string; secret?: string } = {},
): Promise<WithinPostResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.baseUrl ?? withinBaseUrl()).replace(/\/$/, "");
  const secret = options.secret ?? handoffSecret();
  let response: Response;
  try {
    response = await fetchImpl(`${base}/api/ingest/admission`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: "unreachable", error: staffMessageForWithinCode("unreachable") };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const code = readCode(payload);
  if (response.status === 409 || code === "already_admitted") {
    const clientId =
      payload && typeof payload === "object" && typeof (payload as { clientId?: unknown }).clientId === "string"
        ? (payload as { clientId: string }).clientId
        : undefined;
    return { ok: false, code: "already_admitted", error: staffMessageForWithinCode("already_admitted"), clientId };
  }

  if (!response.ok || !payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
    return { ok: false, code: code || `http_${response.status}`, error: staffMessageForWithinCode(code) };
  }

  const data = payload as {
    created?: unknown;
    updated?: unknown;
    id?: unknown;
    withinClientId?: unknown;
    documentsComplete?: unknown;
  };
  if (typeof data.id !== "string" || !data.id) {
    return { ok: false, code: "receive_failed", error: staffMessageForWithinCode("receive_failed") };
  }

  return {
    ok: true,
    created: data.created === true,
    updated: data.updated === true,
    id: data.id,
    withinClientId: typeof data.withinClientId === "string" ? data.withinClientId : body.withinClientId || "",
    status: "awaiting_admission",
    documentsComplete: data.documentsComplete === true,
  };
}

export function formatSentAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

export function sentStatusLine(person: Pick<Person, "within_waiting_status" | "within_sent_at" | "within_sent_by_name">) {
  if (person.within_waiting_status === "already_admitted") return "Already admitted in Within";
  if (person.within_waiting_status !== "awaiting_admission" || !person.within_sent_at) return "";
  const who = person.within_sent_by_name.trim() || "a staff member";
  return `Sent to Within at ${formatSentAt(person.within_sent_at)} by ${who}, awaiting admission.`;
}

export function placementLabel(house: House, phase: ProgramPhase) {
  return `${HOUSE_LABEL[house]} · Phase ${phase}`;
}

function recordSend(
  person: Person,
  actor: User,
  patch: Partial<Person>,
  summary: string,
) {
  const next: Person = { ...person, ...patch, id: person.id, updated_at: new Date().toISOString() };
  replacePerson(next);
  const event = writeAudit({
    personId: person.id,
    action: "within_send",
    summary,
    actorId: actor.id,
    before: person,
    after: next,
  });
  return { person: next, event };
}

export async function sendPersonToWithin(
  personId: string,
  actor: User,
  options: { fetchImpl?: FetchLike; baseUrl?: string; secret?: string; now?: Date } = {},
): Promise<
  | { ok: true; outcome: "sent" | "updated" | "already_admitted"; person: Person; eventId: string }
  | { ok: false; error: string }
> {
  if (!canSendToWithin(actor)) {
    return { ok: false, error: "Only admissions or admin can send a client to Within." };
  }
  const person = getPerson(personId);
  if (!person) return { ok: false, error: "Person not found." };

  const built = buildAwaitingAdmission(person, actor, options.now ?? new Date());
  if (!built.ok) return { ok: false, error: built.error };

  const posted = await postAwaitingAdmission(built.body, options);
  if (!posted.ok && posted.code === "already_admitted") {
    const saved = recordSend(
      person,
      actor,
      {
        within_waiting_status: "already_admitted",
        within_client_id: posted.clientId || person.within_client_id,
        within_sent_at: person.within_sent_at || built.body.sentAt,
        within_sent_by_name: person.within_sent_by_name || actor.name,
        within_sent_by_user_id: person.within_sent_by_user_id || actor.id,
      },
      "Within reported already admitted",
    );
    return { ok: true, outcome: "already_admitted", person: saved.person, eventId: saved.event.id };
  }
  if (!posted.ok) return { ok: false, error: posted.error };

  const updated = posted.updated || Boolean(person.within_waiting_id);
  const saved = recordSend(
    person,
    actor,
    {
      within_waiting_status: "awaiting_admission",
      within_waiting_id: posted.id,
      within_client_id: posted.withinClientId || person.within_client_id || withinClientIdFor(person.id),
      within_sent_at: built.body.sentAt,
      within_sent_by_name: actor.name,
      within_sent_by_user_id: actor.id,
    },
    updated ? "Updated Within waiting record, awaiting admission" : "Sent to Within, awaiting admission",
  );
  return { ok: true, outcome: updated ? "updated" : "sent", person: saved.person, eventId: saved.event.id };
}
