import { createHmac, timingSafeEqual } from "crypto";
import { withinDocumentManifest } from "./documents";
import { HOUSE_LABEL } from "./labels";
import { programPhaseFor } from "./occupancy";
import { getRoom } from "./rooms";
import type { AdmissionKind, House, Person, ProgramPhase } from "./types";

/**
 * Reach → Within admission handoff.
 * Keep the claim shape and HMAC format in sync with Within `src/lib/handoff.ts`.
 * Light identity only. Clinical SoR stays in Within. monday.com is not in this path.
 *
 * Claim version stays 1. Detox intent is additive on the same token:
 * detoxFirst, expectedDetoxNights, detoxIntent.
 * Tokens minted before those fields verify as treatment-with-no-detox, or short stay
 * when admissionKind is detox_containment.
 */

export const DETOX_INTENTS = ["none", "detox_first", "short_stay"] as const;
export type DetoxIntent = (typeof DETOX_INTENTS)[number];

export const HANDOFF_TTL_MS = 12 * 60 * 60 * 1000;

export const DEMO_HANDOFF_SECRET = "reach-within-handoff-demo-secret";

export const PACK_SLUGS = ["demographics", "nok", "roi", "arf", "meds", "history", "form7"] as const;
export type PackSlug = (typeof PACK_SLUGS)[number];

export const PACK_BUTTONS: { slug: PackSlug; label: string; hint: string }[] = [
  { slug: "demographics", label: "Demographics", hint: "Intake identity" },
  { slug: "nok", label: "Next of kin (ARP)", hint: "Account-responsible contact on the file" },
  { slug: "roi", label: "ROI", hint: "Release of information" },
  { slug: "arf", label: "ARF", hint: "Admission risk" },
  { slug: "meds", label: "Meds list", hint: "Admission medicines" },
  { slug: "history", label: "History", hint: "Treatment and medical history" },
  { slug: "form7", label: "Form 7", hint: "Financial assistance application" },
];

export type HandoffClaims = {
  v: 1;
  reachClientId: string;
  withinClientId: string;
  facility: House;
  phase: ProgramPhase;
  admissionKind: AdmissionKind;
  /** True when treatment starts with detox and continues on this same admission. */
  detoxFirst: boolean;
  /** 1–5 when detoxFirst is true; otherwise 0. */
  expectedDetoxNights: number;
  /** none = treatment only; detox_first = detox then programme; short_stay = detox-only / brief. */
  detoxIntent: DetoxIntent;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  nokName: string;
  nokPhone: string;
  fundingType: string;
  room: string;
  admittedOn: string;
  documentsForWithin?: { id: string; kind: string; title: string; filename: string; reachPath: string }[];
  exp: number;
};

export function handoffSecret() {
  return process.env.REACH_WITHIN_HANDOFF_SECRET || DEMO_HANDOFF_SECRET;
}

export function withinBaseUrl() {
  const configured = process.env.WITHIN_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "https://within-production-8f0e.up.railway.app";
  return "http://localhost:3000";
}

export function withinClientIdFor(reachClientId: string) {
  return `reach-${reachClientId}`;
}

export function placementForPerson(person: Person): { facility: House; phase: ProgramPhase } | null {
  if (!person.house) return null;
  if (person.house === "lodge") return { facility: "lodge", phase: "3" };
  const phase = programPhaseFor(person);
  return { facility: "manor", phase: phase === "2" ? "2" : "1" };
}

/** @deprecated Prefer placementForPerson — Manor phase is chosen at admit. */
export function placementForHouse(house: House): { facility: House; phase: "1" | "3" } {
  if (house === "lodge") return { facility: "lodge", phase: "3" };
  return { facility: "manor", phase: "1" };
}

function b64url(value: Buffer) {
  return value.toString("base64url");
}

export function signHandoff(claims: HandoffClaims, secret = handoffSecret()) {
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}~${sig}`;
}

export function verifyHandoff(token: string, secret = handoffSecret()): HandoffClaims | null {
  const splitAt = token.lastIndexOf("~");
  if (splitAt <= 0) return null;
  const payload = token.slice(0, splitAt);
  const sig = token.slice(splitAt + 1);
  if (!payload || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as HandoffClaims;
    if (data.v !== 1 || !data.reachClientId || !data.firstName || !data.lastName) return null;
    if (!data.exp || data.exp < Date.now()) return null;
    if (data.admissionKind !== "program" && data.admissionKind !== "detox_containment") return null;
    if (data.facility !== "manor" && data.facility !== "lodge") return null;
    if (data.phase !== "1" && data.phase !== "2" && data.phase !== "3") return null;
    const detox = normalizeDetoxClaims(data);
    if (!detox) return null;
    return { ...data, ...detox };
  } catch {
    return null;
  }
}

function normalizeDetoxClaims(
  data: Partial<HandoffClaims> & Pick<HandoffClaims, "admissionKind">,
): Pick<HandoffClaims, "detoxFirst" | "expectedDetoxNights" | "detoxIntent"> | null {
  const legacy =
    data.detoxFirst === undefined && data.expectedDetoxNights === undefined && data.detoxIntent === undefined;
  if (legacy) {
    if (data.admissionKind === "detox_containment") {
      return { detoxFirst: false, expectedDetoxNights: 0, detoxIntent: "short_stay" };
    }
    return { detoxFirst: false, expectedDetoxNights: 0, detoxIntent: "none" };
  }

  if (typeof data.detoxFirst !== "boolean") return null;
  if (!Number.isInteger(data.expectedDetoxNights)) return null;
  const nights = data.expectedDetoxNights as number;
  if (nights < 0 || nights > 5) return null;
  if (data.detoxIntent !== "none" && data.detoxIntent !== "detox_first" && data.detoxIntent !== "short_stay") {
    return null;
  }

  if (data.admissionKind === "detox_containment") {
    if (data.detoxIntent !== "short_stay" || data.detoxFirst || nights !== 0) return null;
    return { detoxFirst: false, expectedDetoxNights: 0, detoxIntent: "short_stay" };
  }
  if (data.detoxFirst) {
    if (data.detoxIntent !== "detox_first" || nights < 1) return null;
    return { detoxFirst: true, expectedDetoxNights: nights, detoxIntent: "detox_first" };
  }
  if (data.detoxIntent !== "none" || nights !== 0) return null;
  return { detoxFirst: false, expectedDetoxNights: 0, detoxIntent: "none" };
}

export function claimsForPerson(person: Person, now = Date.now()): HandoffClaims | null {
  if (!person.house || person.stage !== "resident") return null;
  const room = person.room_id ? getRoom(person.room_id) : null;
  const placement = placementForPerson(person);
  if (!placement) return null;
  const admissionKind: AdmissionKind =
    person.admission_kind === "detox_containment" ? "detox_containment" : "program";
  const detoxFirst = admissionKind === "program" && person.detox_first === 1;
  const expectedDetoxNights = detoxFirst ? Number(person.expected_detox_nights) || 0 : 0;
  const detoxIntent: DetoxIntent =
    admissionKind === "detox_containment" ? "short_stay" : detoxFirst ? "detox_first" : "none";
  const docs = withinDocumentManifest(person.id);
  return {
    v: 1,
    reachClientId: person.id,
    withinClientId: person.within_client_id || withinClientIdFor(person.id),
    facility: placement.facility,
    phase: placement.phase,
    admissionKind,
    detoxFirst,
    expectedDetoxNights,
    detoxIntent,
    firstName: person.first_name,
    lastName: person.last_name,
    preferredName: person.preferred_name,
    email: person.email,
    phone: person.phone,
    nokName: person.next_of_kin_name,
    nokPhone: person.next_of_kin_phone,
    fundingType: person.funding_type,
    room: room?.name || "",
    admittedOn: person.admission_date || (person.admitted_at || "").slice(0, 10),
    documentsForWithin: docs.length ? docs : undefined,
    exp: now + HANDOFF_TTL_MS,
  };
}

export function withinPackUrl(person: Person, slug?: PackSlug) {
  const claims = claimsForPerson(person);
  if (!claims) return null;
  const token = signHandoff(claims);
  const base = withinBaseUrl();
  if (!slug) return `${base}/admit-pack/${token}`;
  return `${base}/admit-pack/${token}/go/${slug}`;
}

export function facilityLine(person: Person) {
  if (!person.house) return "Facility not set";
  const placement = placementForPerson(person);
  if (!placement) return HOUSE_LABEL[person.house];
  return `${HOUSE_LABEL[person.house]} · Phase ${placement.phase}`;
}
