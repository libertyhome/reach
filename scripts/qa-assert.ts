import assert from "assert";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import http from "http";
import ExcelJS from "exceljs";
import {
  type AccountingConnector,
  LIBERTY_TENANT,
  registerAccountingConnector,
  sageConnector,
} from "../src/lib/accounting/connector";
import { canSendToWithin, canViewCreditors, canViewExecutive } from "../src/lib/access";
import { assertLeadForms } from "./assert-lead-forms";
import { clearAccountingFixtures, createCreditor, pullAccounting, readProfitAndLossStrip } from "../src/lib/creditors";
import { getDb } from "../src/lib/db";
import { LEAD_SOURCE_LABEL, NOT_CONVERTED_REASON_LABEL } from "../src/lib/labels";
import {
  buildExecutiveAnalytics,
  buildOccupancySnapshot,
  parseAnalyticsFilters,
  percentOf,
  repeatUnclearedCounts,
} from "../src/lib/executive";
import { FORBIDDEN_CLINICAL_FIELDS } from "../src/lib/field-gate";
import { claimsForPerson, signHandoff, verifyHandoff, withinClientIdFor } from "../src/lib/handoff";
import { occupancyParityRow, programPhaseFor } from "../src/lib/occupancy";
import { findPersonByName, insertPerson, listPeople, occupancyCounts, roomOccupant } from "../src/lib/people";
import { applyPersonPatch, checklistComplete, confirmAdmit, updateLeadSource } from "../src/lib/pipeline";
import { contentDispositionFor, documentReachPath, resolveUploadsRoot } from "../src/lib/documents";
import { requestHasHandoffSecret } from "../src/lib/handoff";
import { bedCapacity, roomId } from "../src/lib/houses";
import { listRooms } from "../src/lib/rooms";
import {
  adaptOccupancy,
  bedsAvailable,
  clearOccupancyCache,
  readHouseOccupancy,
  unassignedNotice,
} from "../src/lib/within-occupancy";
import { seed } from "../src/lib/seed";
import { authenticate, findUserById, listUsers } from "../src/lib/users";
import { listAudit, undoEvent, writeAudit } from "../src/lib/audit";
import { buildCommercialDetailsPatch } from "../src/lib/commercial-details";
import { handleListExport } from "../src/lib/export-lists";
import { classifyHistory, listAdmittedHistory, listNotAdmittedHistory } from "../src/lib/history";
import { clampNursingAddonDays, mapOvernightSupervisionAddon } from "../src/lib/migrate";
import { sessionTokenLooksValid } from "../src/lib/session";
import {
  COMMERCIAL_ADDONS,
  COMMERCIAL_CHECKLIST,
  LEAD_SOURCES,
  LEAD_SOURCES_WITH_WHO,
  NOT_CONVERTED_REASONS,
  type Person,
} from "../src/lib/types";
import {
  buildAwaitingAdmission,
  missingRequiredDocuments,
  reachHouseFor,
  requiredDocumentsFor,
  sendPersonToWithin,
  sentStatusLine,
} from "../src/lib/within-send";

getDb();
seed();
{
  const seededForms = getDb().prepare(`SELECT COUNT(*) AS n FROM lead_forms`).get() as { n: number };
  const seededIntake = getDb().prepare(`SELECT COUNT(*) AS n FROM enquiry_intake`).get() as { n: number };
  assert.strictEqual(seededForms.n, 0, "Production seed must not insert lead forms");
  assert.strictEqual(seededIntake.n, 0, "Production seed must not insert lead-form enquiries");
}

const amelia = findPersonByName("Amelia", "Hart");
assert(amelia, "Amelia Hart must be seeded");
assert.strictEqual(amelia.stage, "resident");
assert.strictEqual(amelia.house, "manor");
assert(amelia.room_id.endsWith("willow"), "Amelia Hart must be on Manor room Willow");
assert.strictEqual(amelia.within_handoff_status, "pack_ready");
assert.strictEqual(amelia.within_client_id, withinClientIdFor(amelia.id));
assert.strictEqual(amelia.admission_kind, "program");
assert.strictEqual(amelia.detox_first, 0, "Demo treatment admit has no detox-first flag");
assert.strictEqual(amelia.expected_detox_nights, 0);
assert.strictEqual(amelia.arf_signed, 1, "Amelia must have ARF signed gate");
assert.strictEqual(amelia.arp_signed, 1, "Amelia must have ARP signed gate");
assert.strictEqual(amelia.room_privacy, "private");
assert.strictEqual(amelia.manor_phase, "1", "Amelia Manor phase");
assert.strictEqual(amelia.currency, "ZAR");
assert.strictEqual(amelia.contact_method, "phone");
assert(amelia.assigned_to_user_id, "Amelia assigned enquiry owner");
assert(amelia.counsellor_user_id, "Amelia counsellor");
assert.strictEqual(programPhaseFor(amelia), "1");
const ameliaClaims = claimsForPerson(amelia);
assert(ameliaClaims, "Amelia Hart handoff claims");
assert.strictEqual(ameliaClaims.facility, "manor");
assert.strictEqual(ameliaClaims.phase, "1");
assert.strictEqual(ameliaClaims.firstName, "Amelia");
assert.strictEqual(ameliaClaims.admissionKind, "program");
assert.strictEqual(ameliaClaims.detoxFirst, false);
assert.strictEqual(ameliaClaims.expectedDetoxNights, 0);
assert.strictEqual(ameliaClaims.detoxIntent, "none");
assert.strictEqual(verifyHandoff(signHandoff(ameliaClaims))?.reachClientId, amelia.id);

const legacyClaims = { ...ameliaClaims } as Partial<typeof ameliaClaims>;
delete legacyClaims.detoxFirst;
delete legacyClaims.expectedDetoxNights;
delete legacyClaims.detoxIntent;
const legacyVerified = verifyHandoff(signHandoff(legacyClaims as typeof ameliaClaims));
assert(legacyVerified, "Older handoff tokens without detox fields still verify");
assert.strictEqual(legacyVerified.detoxIntent, "none");
assert.strictEqual(legacyVerified.detoxFirst, false);
assert.strictEqual(legacyVerified.expectedDetoxNights, 0);
const noah = findPersonByName("Noah", "Botha");
assert(noah && noah.stage === "admit", "Noah Botha still waiting on Admit");
assert(checklistComplete(noah), "Noah Botha checklist must be complete including ARF/ARP signed");
assert(noah.preferred_room_id, "Noah should have preferred room draft");
assert(noah.assessment_details, "Noah assessment details");

const parity = occupancyParityRow(amelia);
assert(parity.lead_source, "occupancy parity lead source");
assert(parity.method_of_contact, "occupancy parity method of contact");
assert(parity.facility, "occupancy parity facility");
assert(parity.phase, "occupancy parity phase");
assert(parity.admission_date, "occupancy parity admission date");

const occ = occupancyCounts();
assert.strictEqual(occ.manor, 12, `Manor should be 12/22, got ${occ.manor}`);
assert.strictEqual(occ.lodge, 9, `Lodge should be 9/16, got ${occ.lodge}`);

const asOf = new Date("2026-09-24T12:00:00.000Z");
const roster = listPeople();
const staff = listUsers();
const snap = buildOccupancySnapshot(roster, asOf);
const manorOcc = snap.facilities.find((facility) => facility.house === "manor");
const lodgeOcc = snap.facilities.find((facility) => facility.house === "lodge");
assert(manorOcc && lodgeOcc, "Occupancy covers Manor and Lodge");
assert.strictEqual(manorOcc.capacity, 22);
assert.strictEqual(lodgeOcc.capacity, 16);
assert.strictEqual(bedCapacity("manor"), 22);
assert.strictEqual(bedCapacity("lodge"), 16);
const manorRooms = listRooms("manor");
const lodgeRooms = listRooms("lodge");
assert.strictEqual(
  manorRooms.map((room) => `${room.name}:${room.capacity}`).join(","),
  "Willow:4,Cedar:4,Beech:2,Holly:1,Chestnut:4,Tulip:1,Elm:1,Oak:1,Pepper:2,Maple:2",
);
assert.strictEqual(
  lodgeRooms.map((room) => `${room.name}:${room.capacity}`).join(","),
  "Room 1:2,Room 2:2,Room 3:2,Room 4:2,Room 5:2,Room 6:3,Room 7:1,Room 8:2",
);
assert.strictEqual(
  manorRooms.reduce((sum, room) => sum + room.capacity, 0),
  22,
);
assert.strictEqual(
  lodgeRooms.reduce((sum, room) => sum + room.capacity, 0),
  16,
);
assert.strictEqual(manorRooms.some((room) => room.name === "Yew"), false);
assert.strictEqual(manorOcc.occupied, 12);
assert.strictEqual(lodgeOcc.occupied, 9);
assert.strictEqual(manorOcc.phases.find((phase) => phase.phase === "1")?.occupied, 12);
assert.strictEqual(manorOcc.phases.find((phase) => phase.phase === "2")?.occupied, 0);
assert.strictEqual(lodgeOcc.phases[0]?.phase, "3");
assert.strictEqual(lodgeOcc.phases[0]?.occupied, 9);
assert.strictEqual(snap.mtd.month, "2026-09");
assert(snap.mtd.enquiries > 0, "MTD enquiries come from enquiry_date");
assert(snap.mtd.admissions > 0, "MTD admissions come from admitted residents");
assert(snap.arrivals.some((row) => row.name.includes("Aisha")), "Aisha is a confirmed arrival on 24 Sep");
assert(!snap.arrivals.some((row) => row.name.includes("Ben")), "Unconfirmed expected arrival is not listed");
assert(snap.discharges.some((row) => row.name.includes("Amelia")), "Amelia planned discharge is upcoming");
assert(snap.hygiene.some((flag) => flag.name.includes("Priya") && flag.openGates.length > 0));
assert(snap.hygiene.some((flag) => flag.name.includes("Aisha") && !flag.urgent));
assert(!snap.hygiene.some((flag) => flag.name.includes("Noah")));
assert(snap.residents.some((row) => row.id === amelia.id && row.lead_source && row.admission_date));

const analyticsFilters = parseAnalyticsFilters({ from: "2026-08-01", to: "2026-09-30" }, staff, asOf);
const analytics = buildExecutiveAnalytics(roster, staff, analyticsFilters);
assert(analytics.enquiryCount > 0, "Enquiry volume uses enquiry_date");
assert.strictEqual(
  analytics.leadSourcePie.reduce((sum, slice) => sum + slice.value, 0),
  analytics.enquiryCount,
);
assert(analytics.admissionEventCount > 0, "Admissions over time uses admission dates");
assert.strictEqual(
  analytics.admissionsOverTime.reduce((sum, point) => sum + (point.values[0] ?? 0), 0),
  analytics.admissionEventCount,
);
assert.strictEqual(analytics.conversionPercent, percentOf(analytics.cohortAdmitted, analytics.enquiryCount));
assert.strictEqual(analytics.demographics.status, "unavailable");
assert(analytics.demographics.todo.startsWith("TODO:"), "Demographics stay a stub");
const manorOnly = buildExecutiveAnalytics(roster, staff, { ...analyticsFilters, facility: "manor" });
assert(manorOnly.enquiryCount <= analytics.enquiryCount);

const repeats = repeatUnclearedCounts([
  {
    undone: 0,
    action: "field_edit",
    before_json: JSON.stringify({ deposit_received: 1 }),
    after_json: JSON.stringify({ deposit_received: 0 }),
  },
  {
    undone: 0,
    action: "field_edit",
    before_json: JSON.stringify({ deposit_received: 1 }),
    after_json: JSON.stringify({ deposit_received: 0 }),
  },
  {
    undone: 1,
    action: "field_edit",
    before_json: JSON.stringify({ deposit_received: 1 }),
    after_json: JSON.stringify({ deposit_received: 0 }),
  },
]);
assert.strictEqual(repeats.get("deposit_received"), 2, "Urgent when the same gate is uncleared more than once");

const executive = authenticate("executive@liberty.local", "liberty");
const financeUser = authenticate("finance@liberty.local", "liberty");
assert(executive && canViewExecutive(executive) && canViewCreditors(executive));
assert(financeUser && !canViewExecutive(financeUser) && canViewCreditors(financeUser));
assert(!canViewExecutive({ role: "accounts" }) && !canViewCreditors({ role: "admissions" }));
assert(!canViewCreditors({ role: "therapist" }));

for (const email of ["therapist@liberty.local", "admissions@liberty.local", "accounts@liberty.local"]) {
  const user = authenticate(email, "liberty");
  assert(user, `${email} should sign in with liberty`);
}

assert(sessionTokenLooksValid("user_accounts." + "a".repeat(64)));
assert(!sessionTokenLooksValid("broken"));
assert(!sessionTokenLooksValid("user_accounts.nothex"));

const priya = findPersonByName("Priya", "Naidoo");
assert(priya, "Priya Naidoo enquiry seed");
const beforeStage = priya.stage;
const actor = authenticate("admissions@liberty.local", "liberty")!;
const sourceChange = updateLeadSource(priya.id, "gp", "Changed for QA — must not move stage", actor);
assert(sourceChange.ok);
assert.strictEqual(sourceChange.person.stage, beforeStage, "Lead source must not auto-move");
assert.strictEqual(sourceChange.person.archived_at, "", "Lead source must not archive");

const undone = undoEvent(sourceChange.event.id, actor.id);
assert(undone.ok);
assert.strictEqual(undone.person.lead_source, priya.lead_source);

const accounts = authenticate("accounts@liberty.local", "liberty")!;
const checklistEdit = applyPersonPatch(
  priya.id,
  { deposit_received: 1, arp_signed: 1 },
  accounts,
  "field_edit",
  `Updated admissions checklist — ${accounts.name.split(/\s+/)[0]}`,
);
assert(checklistEdit.ok);
const history = listAudit(priya.id, 5);
assert(
  history.some((event) => event.summary.includes("Pieter") || findUserById(event.actor_id)?.name.includes("Pieter")),
  "History must retain actor for admissions checklist edits",
);
assert(
  COMMERCIAL_CHECKLIST.some((item) => item.key === "arf_signed"),
  "ARF signed stays on the admissions checklist",
);
assert.strictEqual(
  (COMMERCIAL_CHECKLIST as readonly { key: string }[]).some((item) => item.key === "arp_signed"),
  false,
  "ARP is the person, not a second checklist form beside ARF",
);
undoEvent(checklistEdit.event.id, accounts.id);

const vacantManor = listRooms("manor").find((room) => !roomOccupant(room.id));
assert(vacantManor, "A vacant Manor room is required to check admit");

const keptDays = claimsForPerson({ ...amelia, detox_first: 0, expected_detox_nights: 4 });
assert.strictEqual(keptDays?.detoxFirst, true, "A recorded detox day count is not dropped from the handoff");
assert.strictEqual(keptDays?.expectedDetoxNights, 4);
assert.strictEqual(keptDays?.detoxIntent, "detox_first");
const missingDays = claimsForPerson({ ...amelia, detox_first: 1, expected_detox_nights: 0 });
assert.strictEqual(missingDays, null, "Detox on with no day count must not mint a zero-day token");
const shortStayDays = claimsForPerson({
  ...amelia,
  admission_kind: "detox_containment",
  detox_first: 0,
  expected_detox_nights: 3,
});
assert.strictEqual(shortStayDays, null, "Short stay must not mint a token that zeroes a detox day count");

const badAddon = applyPersonPatch(
  noah.id,
  { detox_first: 1, expected_detox_nights: 0 },
  actor,
  "field_edit",
  "Detox add-on without days",
);
assert.strictEqual(badAddon.ok, false);
const addon = applyPersonPatch(
  noah.id,
  { detox_first: 1, expected_detox_nights: 4 },
  actor,
  "field_edit",
  "Detox add-on — 4 days",
);
assert.strictEqual(addon.ok, true);
const wrongCount = confirmAdmit(noah.id, vacantManor.id, "program", actor, {
  manorPhase: "1",
  detoxFirst: "1",
  expectedDetoxNights: "2",
});
assert.strictEqual(wrongCount.ok, false);
if (!wrongCount.ok) assert.match(wrongCount.error, /4/);
const clearDetox = confirmAdmit(noah.id, vacantManor.id, "program", actor, {
  manorPhase: "1",
  detoxFirst: "0",
  expectedDetoxNights: "0",
});
assert.strictEqual(clearDetox.ok, false);
const shortDropsDays = confirmAdmit(noah.id, vacantManor.id, "detox_containment", actor, { manorPhase: "1" });
assert.strictEqual(shortDropsDays.ok, false);
const synced = confirmAdmit(noah.id, vacantManor.id, "program", actor, {
  manorPhase: "1",
  detoxFirst: "1",
  expectedDetoxNights: "4",
});
assert.strictEqual(synced.ok, true);
if (synced.ok) {
  assert.strictEqual(synced.person.detox_first, 1);
  assert.strictEqual(synced.person.expected_detox_nights, 4);
  assert.strictEqual(synced.person.admission_kind, "program");
  const syncedClaims = claimsForPerson(synced.person);
  assert.strictEqual(syncedClaims?.detoxFirst, true);
  assert.strictEqual(syncedClaims?.expectedDetoxNights, 4);
  assert.strictEqual(syncedClaims?.detoxIntent, "detox_first");
  assert.strictEqual(verifyHandoff(signHandoff(syncedClaims!))?.expectedDetoxNights, 4);
  const undoneSynced = undoEvent(synced.event.id, actor.id);
  assert(undoneSynced.ok, "Undo synced detox admit");
}
if (addon.ok) {
  const undoneAddon = undoEvent(addon.event.id, actor.id);
  assert(undoneAddon.ok, "Undo detox add-on");
}
const noahAfterAddon = findPersonByName("Noah", "Botha");
assert(noahAfterAddon && noahAfterAddon.stage === "admit", "Noah still on Admit after add-on undo");
assert.strictEqual(noahAfterAddon.detox_first, 0);
assert.strictEqual(noahAfterAddon.expected_detox_nights, 0);
const missingDetoxAnswer = confirmAdmit(noah.id, vacantManor.id, "program", actor, { manorPhase: "1" });
assert.strictEqual(missingDetoxAnswer.ok, false);
const mixedShortStay = confirmAdmit(noah.id, vacantManor.id, "detox_containment", actor, {
  manorPhase: "1",
  detoxFirst: "1",
  expectedDetoxNights: "2",
});
assert.strictEqual(mixedShortStay.ok, false);
const badDetoxNights = confirmAdmit(noah.id, vacantManor.id, "program", actor, {
  manorPhase: "1",
  detoxFirst: "1",
  expectedDetoxNights: "6",
});
assert.strictEqual(badDetoxNights.ok, false);
const detoxAdmit = confirmAdmit(noah.id, vacantManor.id, "program", actor, {
  manorPhase: "1",
  detoxFirst: "1",
  expectedDetoxNights: "3",
});
assert.strictEqual(detoxAdmit.ok, true);
if (detoxAdmit.ok) {
  assert.strictEqual(detoxAdmit.person.stage, "resident");
  assert.strictEqual(detoxAdmit.person.admission_kind, "program");
  assert.strictEqual(detoxAdmit.person.detox_first, 1);
  assert.strictEqual(detoxAdmit.person.expected_detox_nights, 3);
  assert.strictEqual(detoxAdmit.person.manor_phase, "1");
  const detoxClaims = claimsForPerson(detoxAdmit.person);
  assert(detoxClaims, "Detox-first handoff claims");
  assert.strictEqual(detoxClaims.admissionKind, "program");
  assert.strictEqual(detoxClaims.detoxFirst, true);
  assert.strictEqual(detoxClaims.expectedDetoxNights, 3);
  assert.strictEqual(detoxClaims.detoxIntent, "detox_first");
  assert.strictEqual(detoxClaims.phase, "1");
  const detoxRoundTrip = verifyHandoff(signHandoff(detoxClaims));
  assert.strictEqual(detoxRoundTrip?.detoxIntent, "detox_first");
  assert.strictEqual(detoxRoundTrip?.expectedDetoxNights, 3);
  assert(detoxAdmit.event.summary.includes("detox first"), detoxAdmit.event.summary);
  const undoneDetox = undoEvent(detoxAdmit.event.id, actor.id);
  assert(undoneDetox.ok, "Undo detox-first admit");
}
const noahRestored = findPersonByName("Noah", "Botha");
assert(noahRestored && noahRestored.stage === "admit", "Noah returns to Admit after undo");
assert.strictEqual(noahRestored.detox_first, 0);
assert.strictEqual(noahRestored.expected_detox_nights, 0);

const shortStay = confirmAdmit(noah.id, vacantManor.id, "detox_containment", actor, { manorPhase: "1" });
assert.strictEqual(shortStay.ok, true);
if (shortStay.ok) {
  assert.strictEqual(shortStay.person.admission_kind, "detox_containment");
  assert.strictEqual(shortStay.person.detox_first, 0);
  assert.strictEqual(shortStay.person.expected_detox_nights, 0);
  const shortClaims = claimsForPerson(shortStay.person);
  assert.strictEqual(shortClaims?.admissionKind, "detox_containment");
  assert.strictEqual(shortClaims?.detoxIntent, "short_stay");
  assert.strictEqual(shortClaims?.detoxFirst, false);
  assert.strictEqual(shortClaims?.expectedDetoxNights, 0);
  const undoneShort = undoEvent(shortStay.event.id, actor.id);
  assert(undoneShort.ok, "Undo short stay admit");
}
assert.strictEqual(findPersonByName("Noah", "Botha")?.stage, "admit");

const bannedName = ["appro", "ach"].join("");
const repo = execSync(
  `rg -n -i '${bannedName}' --glob '!node_modules/**' --glob '!.next/**' --glob '!package-lock.json' --glob '!scripts/qa-assert.ts' --glob '!*.patch' . || true`,
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);
assert.strictEqual(repo.trim(), "", `Banned product name must not appear:\n${repo}`);

const columns = (
  getDb().prepare(`PRAGMA table_info(people)`).all() as { name: string }[]
).map((column) => column.name);
for (const field of FORBIDDEN_CLINICAL_FIELDS) {
  assert(!columns.includes(field), `people table must not have clinical column ${field}`);
}
for (const needed of [
  "arf_signed",
  "arp_signed",
  "room_privacy",
  "addon_medical_float",
  "addon_nursing_medical_admission",
  "addon_nursing_days",
  "addon_psych_admission",
  "addon_overnight_supervision",
  "addon_medical_visa",
  "addon_detox_overnight",
  "addon_detox_overnight_days",
  "caller_name",
  "resident_name",
  "lead_source_who",
  "arp_email",
  "not_converted_reason",
  "transfer_extension_status",
  "transfer_extension_notes",
  "contact_method",
  "assigned_to_user_id",
  "counsellor_user_id",
  "referral_owner_user_id",
  "referrer_name",
  "referrer_contact_person",
  "currency",
  "preferred_room_id",
  "assessment_details",
  "assessment_notes",
  "manor_phase",
  "admission_date",
  "planned_discharge_date",
  "detox_first",
  "expected_detox_nights",
]) {
  assert(columns.includes(needed), `people table must have ${needed}`);
}

const tables = (
  getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
).map((row) => row.name);
assert.strictEqual(findPersonByName("Priya", "Naidoo")?.lead_source, "website", "Old enquiry lead source is kept");
assert.strictEqual(
  findPersonByName("Priya", "Naidoo")?.commercial_notes,
  "Web form. Wants a call this week.",
  "Old enquiry notes are kept",
);
assert.strictEqual(LEAD_SOURCE_LABEL.website, "Website");
assert.strictEqual(LEAD_SOURCE_LABEL.recovery_com, "Recovery.com");
assert.strictEqual(LEAD_SOURCE_LABEL.google_adwords, "Google ad words");
assert.deepStrictEqual([...LEAD_SOURCES_WITH_WHO], ["recovery_coach", "referrer", "personal_contact"]);
for (const label of [
  "Recovery.com",
  "Returning Client",
  "Ex-resident",
  "Google.com",
  "Google.nl",
  "Google.be",
  "Meta ads",
  "Google ad words",
  "Recovery Coach",
  "Referrer",
  "Personal Contact",
]) {
  assert(Object.values(LEAD_SOURCE_LABEL).includes(label), `Lead source label missing: ${label}`);
}
assert.strictEqual(NOT_CONVERTED_REASONS.length, 7);
assert.strictEqual(NOT_CONVERTED_REASON_LABEL.affordability_above_budget, "Affordability issue – Above budget");
assert.strictEqual(NOT_CONVERTED_REASON_LABEL.affordability_copayment, "Affordability – Co-payment");
assert.strictEqual(NOT_CONVERTED_REASON_LABEL.unsuitability_adolescent, "Unsuitability – Adolescent");
assert(
  COMMERCIAL_ADDONS.some((item) => item.label === "Medical Visa"),
  "Medical Visa is a commercial add-on",
);
assert.strictEqual(
  (COMMERCIAL_ADDONS as readonly { label: string }[]).some((item) => item.label === "Overnight supervision"),
  false,
  "Overnight supervision is no longer a commercial add-on label",
);
assert((LEAD_SOURCES as readonly string[]).includes("recovery_com"));

const overnightId = "p_qa_overnight_map";
getDb().prepare(`DELETE FROM people WHERE id = ?`).run(overnightId);
insertPerson(
  qaPerson({
    id: overnightId,
    first_name: "Overnight",
    last_name: "Map",
    stage: "enquiry",
    lead_source: "gp",
    commercial_notes: "Keep this note",
    addon_overnight_supervision: 1,
  }),
);
getDb()
  .prepare(
    `UPDATE people
     SET addon_overnight_supervision = 1,
         addon_detox_overnight = 0,
         addon_detox_overnight_days = 0,
         lead_source = 'gp',
         commercial_notes = 'Keep this note'
     WHERE id = ?`,
  )
  .run(overnightId);
mapOvernightSupervisionAddon(getDb());
const mappedOvernight = findPersonByName("Overnight", "Map");
assert(mappedOvernight, "Overnight supervision row maps");
assert.strictEqual(mappedOvernight.addon_detox_overnight, 1, "Old overnight supervision maps to detox/overnight");
assert.strictEqual(mappedOvernight.addon_overnight_supervision, 1, "Old overnight flag is kept");
assert.strictEqual(mappedOvernight.addon_detox_overnight_days, 0, "Mapped rows do not invent a day count");
assert.strictEqual(mappedOvernight.lead_source, "gp", "Mapping does not rewrite lead source");
assert.strictEqual(mappedOvernight.commercial_notes, "Keep this note", "Mapping does not rewrite notes");
getDb().prepare(`DELETE FROM people WHERE id = ?`).run(overnightId);

assert(tables.includes("person_documents"), "person_documents table required");
assert(tables.includes("creditors"), "creditors table required");
assert(tables.includes("accounting_pnl"), "accounting_pnl table required");

const executiveActor = authenticate("executive@liberty.local", "liberty");
assert(executiveActor, "Executive desk can sign in");
const createdCreditor = createCreditor(
  {
    name: "QA Supplier",
    facility: "manor",
    contactName: "Accounts clerk",
    email: "qa-supplier@example.invalid",
    phone: "021 555 0199",
    accountReference: "QA-1",
    notes: "Scaffold row",
  },
  executiveActor.id,
);
assert(createdCreditor.ok, "Creditor create");
if (createdCreditor.ok) {
  assert.strictEqual(createdCreditor.sync.ok, false);
  assert.strictEqual(createdCreditor.sync.status, "not_wired");
  assert.strictEqual(createdCreditor.creditor.sync_state, "pending_push");
}
const beforePull = readProfitAndLossStrip();
assert.strictEqual(beforePull.connectorId, "sage");
assert.strictEqual(beforePull.wired, false);
assert(beforePull.lines.every((line) => line.revenue === null && line.profitLoss === null));
const sagePull = pullAccounting(executiveActor.id, new Date("2026-09-24T12:00:00.000Z"));
assert.strictEqual(sagePull.imported, 0);
assert.strictEqual(readProfitAndLossStrip().wired, false, "Sage stub must not invent P&L");

const fixture: AccountingConnector = {
  id: "fixture-ledger",
  label: "Fixture ledger",
  pushCreditor(payload) {
    return { ok: true, status: "ok", data: { externalId: payload.externalId || "qa-pushed" } };
  },
  pushCreditorDelete() {
    return { ok: true, status: "ok", data: { deleted: true } };
  },
  pullCreditors(company) {
    if (company !== "manor") return { ok: true, status: "ok", data: [] };
    return {
      ok: true,
      status: "ok",
      data: [
        {
          reachId: "",
          externalId: "qa-ext-1",
          name: "QA Pulled Supplier",
          facility: "manor",
          contactName: "Ledger",
          email: "",
          phone: "",
          accountReference: "EXT-1",
          notes: "",
        },
      ],
    };
  },
  pullProfitAndLoss(input) {
    if (input.company === "lodge") {
      return {
        ok: true,
        status: "ok",
        data: {
          company: input.company,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          currency: "ZAR",
          revenue: null,
          profitLoss: null,
          sourcedAt: null,
        },
      };
    }
    return {
      ok: true,
      status: "ok",
      data: {
        company: input.company,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: "ZAR",
        revenue: 100,
        profitLoss: -5,
        sourcedAt: "2026-09-24T00:00:00.000Z",
      },
    };
  },
};

registerAccountingConnector(LIBERTY_TENANT, fixture);
try {
  const pulled = pullAccounting(executiveActor.id, new Date("2026-09-24T12:00:00.000Z"));
  assert.strictEqual(pulled.imported, 1, "Pluggable connector pull lands creditor rows");
  const strip = readProfitAndLossStrip();
  assert.strictEqual(strip.connectorId, "fixture-ledger");
  assert.strictEqual(strip.lines.find((line) => line.company === "manor")?.revenue, 100);
  assert.strictEqual(strip.lines.find((line) => line.company === "manor")?.profitLoss, -5);
  assert.strictEqual(strip.lines.find((line) => line.company === "lodge")?.revenue, null);
  assert.strictEqual(strip.lines.find((line) => line.company === "lodge")?.profitLoss, null);
} finally {
  registerAccountingConnector(LIBERTY_TENANT, sageConnector);
  clearAccountingFixtures("fixture-ledger");
  getDb().prepare(`DELETE FROM creditors WHERE name = ? OR external_id = ?`).run("QA Supplier", "qa-ext-1");
  getDb().prepare(`DELETE FROM accounting_pnl WHERE connector_id = ?`).run("sage");
}
assert.strictEqual(readProfitAndLossStrip().wired, false, "Restored Sage strip stays empty");
assert.strictEqual(readProfitAndLossStrip().connectorId, "sage");

const admissionsActor = findUserById("user_admissions");
const executiveActorForSend = findUserById("user_executive");
const therapistActor = findUserById("user_therapist");
const accountsActor = findUserById("user_accounts");
assert(admissionsActor && executiveActorForSend && therapistActor && accountsActor, "Staff for Within send");
assert.strictEqual(canSendToWithin(admissionsActor), true);
assert.strictEqual(canSendToWithin(executiveActorForSend), true);
assert.strictEqual(canSendToWithin(therapistActor), false);
assert.strictEqual(canSendToWithin(accountsActor), false);

assert(requiredDocumentsFor("manor").some((item) => item.kind === "manor_coc"));
assert(!requiredDocumentsFor("manor").some((item) => item.kind === "coc" || item.kind === "visitors"));
assert(requiredDocumentsFor("lodge").some((item) => item.kind === "coc"));
assert(!requiredDocumentsFor("lodge").some((item) => item.kind === "manor_coc"));
assert.strictEqual(requiredDocumentsFor("manor").some((item) => item.kind === "form7"), true);

function qaPerson(partial: Partial<Person> & Pick<Person, "id" | "first_name" | "last_name">): Person {
  const stamp = "2026-09-25T08:00:00.000Z";
  return {
    id: partial.id,
    first_name: partial.first_name,
    last_name: partial.last_name,
    preferred_name: partial.preferred_name ?? "",
    email: partial.email ?? "",
    phone: partial.phone ?? "",
    enquiry_date: "2026-09-01",
    lead_source: "family",
    lead_source_note: "",
    lead_source_who: "",
    caller_name: "",
    resident_name: "",
    contact_method: "phone",
    assigned_to_user_id: "user_admissions",
    counsellor_user_id: partial.counsellor_user_id ?? "",
    referral_owner_user_id: "user_admissions",
    referrer_name: partial.referrer_name ?? "",
    referrer_contact_person: partial.referrer_contact_person ?? "",
    referrer_phone: partial.referrer_phone ?? "",
    next_of_kin_name: partial.next_of_kin_name ?? "",
    next_of_kin_phone: partial.next_of_kin_phone ?? "",
    arp_email: "",
    funding_type: partial.funding_type ?? "medical_aid",
    funding_notes: "",
    currency: "ZAR",
    expected_arrival: partial.expected_arrival ?? "",
    admission_date: partial.admission_date ?? "2026-10-02",
    planned_discharge_date: partial.planned_discharge_date ?? "2026-11-02",
    house_preference: partial.house_preference ?? "",
    preferred_room_id: partial.preferred_room_id ?? "",
    commercial_notes: "",
    not_converted_reason: "",
    assessment_details: "",
    assessment_notes: "",
    stage: partial.stage ?? "admit",
    house: partial.house ?? "",
    room_id: partial.room_id ?? "",
    room_privacy: "",
    manor_phase: partial.manor_phase ?? "",
    accounts_approved: 1,
    clinical_approved: 1,
    deposit_received: 1,
    arp_signed: partial.arp_signed ?? 0,
    arf_signed: partial.arf_signed ?? 0,
    funding_confirmed: 1,
    admission_date_agreed: 1,
    room_offered: 1,
    addon_medical_float: 0,
    addon_nursing_medical_admission: 0,
    addon_nursing_days: 0,
    addon_psych_admission: 0,
    addon_overnight_supervision: 0,
    addon_medical_visa: 0,
    addon_detox_overnight: 0,
    addon_detox_overnight_days: 0,
    transfer_extension_status: "",
    transfer_extension_notes: "",
    within_handoff_status: "none",
    within_client_id: partial.within_client_id ?? "",
    admission_kind: partial.admission_kind ?? "",
    detox_first: partial.detox_first ?? 0,
    expected_detox_nights: partial.expected_detox_nights ?? 0,
    within_waiting_status: partial.within_waiting_status ?? "",
    within_sent_at: partial.within_sent_at ?? "",
    within_sent_by_name: partial.within_sent_by_name ?? "",
    within_sent_by_user_id: partial.within_sent_by_user_id ?? "",
    within_waiting_id: partial.within_waiting_id ?? "",
    admitted_at: "",
    archived_at: "",
    created_at: stamp,
    updated_at: stamp,
  };
}

const manorClient = qaPerson({
  id: "p_qa_within_manor",
  first_name: "Cipher",
  last_name: "Row",
  email: "cipher.row@example.invalid",
  phone: "000111222",
  house_preference: "manor",
  preferred_room_id: "manor-beech",
  manor_phase: "2",
  referrer_name: "City Clinic",
  referrer_contact_person: "Dr Nkosi",
  referrer_phone: "0115550100",
  next_of_kin_name: "Lerato Row",
  next_of_kin_phone: "000111223",
  counsellor_user_id: "user_therapist",
  admission_kind: "program",
  detox_first: 1,
  expected_detox_nights: 3,
});

assert.strictEqual(reachHouseFor(manorClient), "manor");
assert.strictEqual(
  reachHouseFor({ ...manorClient, house: "manor", room_id: roomId("lodge", "Room 1") }),
  null,
  "Confirmed Manor and a Lodge room must not send",
);
assert.strictEqual(
  reachHouseFor({ ...manorClient, house: "", house_preference: "manor", preferred_room_id: roomId("lodge", "Room 1") }),
  null,
  "Manor preference and a Lodge room must not send",
);
assert.strictEqual(reachHouseFor({ ...manorClient, house: "", house_preference: "either", preferred_room_id: "" }), null);
assert.strictEqual(reachHouseFor({ ...manorClient, house: "lodge", house_preference: "manor", room_id: "" }), "lodge");

const manorPreview = buildAwaitingAdmission(manorClient, admissionsActor, new Date("2026-09-25T09:00:00.000Z"), []);
assert(manorPreview.ok, "Manor preview builds");
if (manorPreview.ok) {
  assert.strictEqual(manorPreview.body.v, 2);
  assert.strictEqual(manorPreview.body.intent, "awaiting_admission");
  assert.strictEqual(manorPreview.body.house, "weltevreden_manor");
  assert.strictEqual(manorPreview.body.phase, "2");
  assert.notStrictEqual(manorPreview.body.house, "liberty_lodge");
  assert.strictEqual(manorPreview.body.admissionKind, "program");
  assert.strictEqual(manorPreview.body.detoxFirst, true);
  assert.strictEqual(manorPreview.body.expectedDetoxNights, 3);
  assert.strictEqual(manorPreview.body.detoxIntent, "detox_first");
  assert.strictEqual(typeof manorPreview.body.documentsComplete, "boolean");
  assert.strictEqual(manorPreview.body.documentsComplete, false);
  assert.strictEqual(manorPreview.body.reachClientId, manorClient.id);
  assert.strictEqual(manorPreview.body.withinClientId, `reach-${manorClient.id}`);
  assert.strictEqual(manorPreview.body.room, "Beech");
  assert.strictEqual(manorPreview.body.fundingType, "medical_aid");
  assert.strictEqual(manorPreview.body.admissionDate, "2026-10-02");
  assert.strictEqual(manorPreview.body.referrer?.name, "Dr Nkosi");
  assert.strictEqual(manorPreview.body.referrer?.organisation, "City Clinic");
  assert.strictEqual(manorPreview.body.nextOfKin?.name, "Lerato Row");
  assert.strictEqual(manorPreview.body.counsellor, "Lelethu Therapist");
  assert.strictEqual(manorPreview.body.sentBy.reachUserId, admissionsActor.id);
  assert.strictEqual(manorPreview.body.sentBy.email, admissionsActor.email);
  assert(manorPreview.missing.some((item) => item.label === "Form 7"));
  assert(manorPreview.missing.some((item) => item.kind === "manor_coc"));
  assert(!manorPreview.missing.some((item) => item.kind === "coc" || item.kind === "visitors"));
}

const lodgeClient = qaPerson({
  id: "p_qa_within_lodge",
  first_name: "Lodge",
  last_name: "Only",
  house_preference: "lodge",
  preferred_room_id: roomId("lodge", "Room 1"),
  manor_phase: "1",
  admission_kind: "detox_containment",
});
const lodgePreview = buildAwaitingAdmission(lodgeClient, executiveActorForSend, new Date("2026-09-25T09:00:00.000Z"), []);
assert(lodgePreview.ok, "Lodge preview builds");
if (lodgePreview.ok) {
  assert.strictEqual(lodgePreview.body.house, "liberty_lodge");
  assert.strictEqual(lodgePreview.body.phase, "3", "Lodge is phase 3 even if a Manor phase was stored");
  assert.strictEqual(lodgePreview.body.admissionKind, "detox_containment");
  assert.strictEqual(lodgePreview.body.detoxFirst, false);
  assert.strictEqual(lodgePreview.body.expectedDetoxNights, 0);
  assert.strictEqual(lodgePreview.body.detoxIntent, "short_stay");
  assert(lodgePreview.missing.some((item) => item.kind === "coc"));
  assert(!lodgePreview.missing.some((item) => item.kind === "manor_coc"));
}

const brokenDetox = buildAwaitingAdmission(
  { ...manorClient, admission_kind: "detox_containment", detox_first: 1, expected_detox_nights: 2 },
  admissionsActor,
  new Date("2026-09-25T09:00:00.000Z"),
  [],
);
assert.strictEqual(brokenDetox.ok, false);

const handoffSecretForTest = "qa-within-handoff-secret";
const qaIds = [manorClient.id, lodgeClient.id];

function addWithinDoc(personId: string, kind: string, forWithin = 1) {
  getDb()
    .prepare(
      `INSERT INTO person_documents (
        id, person_id, kind, title, filename, stored_name, mime_type, size_bytes, for_within, uploaded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', 12, ?, 'user_admissions', '2026-09-25T08:00:00.000Z')`,
    )
    .run(`doc-${personId}-${kind}-${forWithin}`, personId, kind, kind, `${kind}.pdf`, `${kind}.pdf`, forWithin);
}

function cleanupWithinQa() {
  for (const id of qaIds) {
    getDb().prepare(`DELETE FROM person_documents WHERE person_id = ?`).run(id);
    getDb().prepare(`DELETE FROM audit_events WHERE entity_id = ?`).run(id);
    getDb().prepare(`DELETE FROM people WHERE id = ?`).run(id);
  }
}

cleanupWithinQa();
insertPerson(manorClient);
insertPerson(lodgeClient);

for (const kind of requiredDocumentsFor("manor")) addWithinDoc(manorClient.id, kind.kind);
addWithinDoc(manorClient.id, "coc");
addWithinDoc(manorClient.id, "form7", 0);
for (let index = 0; index < 41; index += 1) addWithinDoc(manorClient.id, `attachment_${index}`);

const complete = buildAwaitingAdmission(
  { ...manorClient, arp_signed: 0, arf_signed: 0 },
  admissionsActor,
  new Date("2026-09-25T09:00:00.000Z"),
);
assert(complete.ok && complete.documentsComplete, "Uploaded required documents mark the pack complete");
if (complete.ok) {
  assert.strictEqual(complete.body.documentsComplete, true);
  assert.ok(complete.body.documents);
  assert.strictEqual(complete.body.documents.length, 40);
  assert.ok(!complete.body.documents.some((doc) => doc.kind === "coc"), "Lodge-only documents stay off a Manor send");
  assert.ok(complete.body.documents.every((doc) => typeof doc.signed === "boolean"));
}
assert.strictEqual(missingRequiredDocuments({ ...manorClient, arp_signed: 1 }, "manor").some((item) => item.kind === "nok"), false);

type Captured = { authorization: string; body: string };
const captured: Captured[] = [];
const responses: { status: number; json: Record<string, unknown> }[] = [
  {
    status: 200,
    json: {
      ok: true,
      created: true,
      updated: false,
      id: "wait-qa-manor",
      reachClientId: manorClient.id,
      withinClientId: `reach-${manorClient.id}`,
      status: "awaiting_admission",
      house: "weltevreden_manor",
      documentsComplete: true,
    },
  },
  {
    status: 200,
    json: {
      ok: true,
      created: false,
      updated: true,
      id: "wait-qa-manor",
      reachClientId: manorClient.id,
      withinClientId: `reach-${manorClient.id}`,
      status: "awaiting_admission",
      house: "weltevreden_manor",
      documentsComplete: true,
    },
  },
  {
    status: 409,
    json: {
      ok: false,
      error: "This Reach client is already admitted in Within. The waiting record was not changed.",
      code: "already_admitted",
      clientId: `reach-${manorClient.id}`,
      waitingId: "wait-qa-manor",
    },
  },
  {
    status: 200,
    json: {
      ok: true,
      created: true,
      updated: false,
      id: "wait-qa-lodge",
      reachClientId: lodgeClient.id,
      withinClientId: `reach-${lodgeClient.id}`,
      status: "awaiting_admission",
      house: "liberty_lodge",
      phase: "3",
      documentsComplete: false,
    },
  },
];

const mock = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  captured.push({
    authorization: req.headers.authorization || "",
    body: Buffer.concat(chunks).toString("utf8"),
  });
  const next = responses.shift() ?? { status: 500, json: { ok: false, code: "receive_failed" } };
  res.writeHead(next.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(next.json));
});

async function runMockedWithinSend() {
  if (!therapistActor) throw new Error("Therapist staff user is missing.");
  if (!admissionsActor) throw new Error("Admissions staff user is missing.");
  if (!executiveActorForSend) throw new Error("Executive staff user is missing.");

await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
const address = mock.address();
const port = typeof address === "object" && address ? address.port : 0;
const mockBase = `http://127.0.0.1:${port}`;

const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;
const leaked: string[] = [];
function tap(method: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    const line = args.map((arg) => (typeof arg === "string" ? arg : "")).join(" ");
    if (line.includes(handoffSecretForTest) || line.includes("Cipher") || line.includes("cipher.row")) leaked.push(line);
    method(...args);
  };
}
console.log = tap(originalLog) as typeof console.log;
console.info = tap(originalInfo) as typeof console.info;
console.warn = tap(originalWarn) as typeof console.warn;
console.error = tap(originalError) as typeof console.error;

try {
  const refusedRole = await sendPersonToWithin(manorClient.id, therapistActor, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
  });
  assert.strictEqual(refusedRole.ok, false);
  assert.strictEqual(captured.length, 0, "A therapist send must not call Within");

  const unknown = qaPerson({
    id: "p_qa_within_unknown",
    first_name: "No",
    last_name: "House",
    house_preference: "either",
  });
  qaIds.push(unknown.id);
  insertPerson(unknown);
  const refusedHouse = await sendPersonToWithin(unknown.id, admissionsActor, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
  });
  assert.strictEqual(refusedHouse.ok, false);
  assert.strictEqual(captured.length, 0, "Unknown house must not call Within");

  const sentAt = new Date("2026-09-25T09:30:00.000Z");
  const first = await sendPersonToWithin(manorClient.id, admissionsActor, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
    now: sentAt,
  });
  assert(first.ok && first.outcome === "sent", "First commercial send is created");
  if (first.ok) {
    assert.strictEqual(first.person.within_waiting_status, "awaiting_admission");
    assert.strictEqual(first.person.within_waiting_id, "wait-qa-manor");
    assert.strictEqual(first.person.within_sent_by_name, admissionsActor.name);
    assert.strictEqual(sentStatusLine(first.person).includes("awaiting admission"), true);
    assert.strictEqual(sentStatusLine(first.person).includes(admissionsActor.name), true);
  }
  const firstBody = JSON.parse(captured[0].body) as {
    reachClientId: string;
    documentsComplete: boolean;
    house: string;
    phase: string;
    documents: { kind: string; reachPath: string }[];
  };
  assert.ok(captured[0].authorization === `Bearer ${handoffSecretForTest}`, "Authorization must be the handoff bearer");
  assert.ok(!captured[0].body.includes(handoffSecretForTest), "Payload must not carry the handoff secret");
  assert.strictEqual(firstBody.reachClientId, manorClient.id);
  assert.strictEqual(typeof firstBody.documentsComplete, "boolean");
  assert.strictEqual(firstBody.house, "weltevreden_manor");
  assert.strictEqual(firstBody.phase, "2");
  assert.ok(!firstBody.documents.some((doc) => doc.kind === "coc"));
  assert.ok(
    firstBody.documents.every((doc) => doc.reachPath.startsWith("http") && doc.reachPath.includes("/api/documents/")),
    "Within receives an absolute document URL",
  );

  const second = await sendPersonToWithin(manorClient.id, admissionsActor, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
    now: new Date("2026-09-25T10:00:00.000Z"),
  });
  assert(second.ok && second.outcome === "updated", "Resend updates the same waiting row");
  const secondBody = JSON.parse(captured[1].body) as { reachClientId: string };
  assert.strictEqual(secondBody.reachClientId, firstBody.reachClientId);
  if (second.ok) assert.strictEqual(second.person.within_waiting_id, "wait-qa-manor");

  const admitted = await sendPersonToWithin(manorClient.id, admissionsActor, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
  });
  assert(admitted.ok && admitted.outcome === "already_admitted");
  if (admitted.ok) {
    assert.strictEqual(admitted.person.within_waiting_status, "already_admitted");
    assert.strictEqual(sentStatusLine(admitted.person), "Already admitted in Within");
  }

  const lodgeSend = await sendPersonToWithin(lodgeClient.id, executiveActorForSend, {
    baseUrl: mockBase,
    secret: handoffSecretForTest,
    now: new Date("2026-09-25T11:00:00.000Z"),
  });
  assert(lodgeSend.ok && lodgeSend.outcome === "sent");
  const lodgeBody = JSON.parse(captured[3].body) as { house: string; phase: string; documentsComplete: boolean };
  assert.strictEqual(lodgeBody.house, "liberty_lodge");
  assert.strictEqual(lodgeBody.phase, "3");
  assert.strictEqual(lodgeBody.documentsComplete, false);

  const events = listAudit(manorClient.id);
  assert(events.some((event) => event.action === "within_send"));
  for (const event of events) {
    assert.ok(!event.summary.includes("Cipher"), "Timeline summary must not include the client name");
    assert.ok(!event.summary.includes(handoffSecretForTest), "Timeline must not include the handoff secret");
    assert.ok(!event.before_json.includes(handoffSecretForTest));
    assert.ok(!event.after_json.includes(handoffSecretForTest));
  }
  assert.strictEqual(leaked.length, 0, "Logs must not include the handoff secret or client identity");
} finally {
  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
  await new Promise<void>((resolve) => mock.close(() => resolve()));
  cleanupWithinQa();
}
}

function namedResidents(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${index + 1}`,
    clientId: `${prefix}-${index + 1}`,
    admissionDate: "2026-09-01",
  }));
}

async function runOccupancyQa() {
  clearOccupancyCache();
  const adapted = adaptOccupancy({
    ok: true,
    asOf: "2026-09-25T18:00:00.000Z",
    houses: [
      {
        house: "weltevreden_manor",
        name: "Weltevreden Manor",
        capacity: 22,
        occupied: 1,
        available: 21,
        unassigned: [],
        rooms: [
          {
            id: "willow",
            name: "Willow",
            capacity: 4,
            beds: [
              {
                id: "willow-1",
                name: "Bed 1",
                occupied: true,
                patient: { name: "Ada Nkosi", clientId: "client-ada", admissionDate: "2026-09-12" },
              },
              { id: "willow-2", name: "Bed 2", occupied: false, patient: null },
            ],
          },
        ],
      },
      {
        house: "liberty_lodge",
        capacity: 16,
        occupied: 0,
        available: 16,
        unassigned: [{ name: "Sam Vale", clientId: "client-sam", admissionDate: "2026-09-01" }],
        rooms: [
          {
            id: "lodge-6",
            name: "Room 6",
            capacity: 3,
            private: false,
            beds: [
              { id: "lodge-6-1", name: "Bed 1", occupied: false, patient: null },
              { id: "lodge-6-2", name: "Bed 2", occupied: false, patient: null },
              { id: "lodge-6-3", name: "Bed 3", occupied: false, patient: null },
            ],
          },
        ],
      },
    ],
    totals: { capacity: 38, occupied: 1, available: 37, unassigned: 1 },
  });
  assert(adapted?.houses.manor && adapted.houses.lodge, "Occupancy adapter keeps Manor and Lodge apart");
  assert.strictEqual(adapted.asOf, "2026-09-25T18:00:00.000Z");
  assert.strictEqual(adapted.houses.manor.rooms[0].beds[0].occupant?.patientName, "Ada Nkosi");
  assert.strictEqual(adapted.houses.manor.rooms[0].beds[0].label, "Bed 1");
  assert.strictEqual(adapted.houses.manor.rooms[0].beds[1].occupant, null);
  assert.strictEqual(adapted.houses.lodge.rooms[0].name, "Room 6");
  assert.strictEqual(adapted.houses.lodge.unassigned[0].patientName, "Sam Vale");
  assert.strictEqual(adaptOccupancy({ ok: false, error: "no" }), null, "A refused body must not replace the last sync");
  assert.strictEqual(adaptOccupancy({ ok: true }), null, "A non-census body must not replace the last sync");
  assert.strictEqual(unassignedNotice(23), "23 residents not yet allocated to a bed in Within");
  assert.strictEqual(unassignedNotice(1), "1 resident not yet allocated to a bed in Within");
  assert.strictEqual(bedsAvailable(22, 23), 0);
  assert.strictEqual(bedsAvailable(16, 12), 4);

  let productionShape = false;
  const server = http.createServer((req, res) => {
    const bearer = req.headers.authorization || "";
    const header = req.headers["x-reach-handoff-secret"] || "";
    if (bearer !== "Bearer occupancy-secret" && header !== "occupancy-secret") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    if (!productionShape) {
      res.end(
        JSON.stringify({
          ok: true,
          asOf: "2026-09-25T12:00:00.000Z",
          houses: [
            {
              house: "weltevreden_manor",
              capacity: 22,
              occupied: 1,
              available: 21,
              unassigned: [],
              rooms: [
                {
                  name: "Holly",
                  capacity: 1,
                  beds: [
                    {
                      id: "holly-1",
                      name: "Bed 1",
                      occupied: true,
                      patient: { name: "Holly Guest", clientId: "c-holly", admissionDate: "2026-09-02" },
                    },
                  ],
                },
              ],
            },
            {
              house: "liberty_lodge",
              capacity: 16,
              occupied: 1,
              available: 15,
              unassigned: [],
              rooms: [
                {
                  name: "Room 7",
                  capacity: 1,
                  beds: [
                    {
                      id: "lodge-7-1",
                      name: "Bed 1",
                      occupied: true,
                      patient: { name: "Lodge Guest", clientId: "c-lodge", admissionDate: "2026-09-03" },
                    },
                  ],
                },
              ],
            },
          ],
          totals: { capacity: 38, occupied: 2, available: 36, unassigned: 0 },
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        ok: true,
        asOf: "2026-09-25T18:00:00.000Z",
        houses: [
          {
            house: "weltevreden_manor",
            capacity: 22,
            occupied: 0,
            available: 22,
            unassigned: namedResidents("Manor resident", 23),
            rooms: [
              {
                name: "Willow",
                capacity: 4,
                beds: [
                  { id: "willow-1", name: "Bed 1", occupied: false, patient: null },
                  { id: "willow-2", name: "Bed 2", occupied: false, patient: null },
                  { id: "willow-3", name: "Bed 3", occupied: false, patient: null },
                  { id: "willow-4", name: "Bed 4", occupied: false, patient: null },
                ],
              },
            ],
          },
          {
            house: "liberty_lodge",
            capacity: 16,
            occupied: 0,
            available: 16,
            unassigned: namedResidents("Lodge resident", 12),
            rooms: [
              {
                name: "Room 1",
                capacity: 2,
                beds: [
                  { id: "lodge-1-1", name: "Bed 1", occupied: false, patient: null },
                  { id: "lodge-1-2", name: "Bed 2", occupied: false, patient: null },
                ],
              },
            ],
          },
        ],
        totals: { capacity: 38, occupied: 0, available: 38, unassigned: 35 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const live = await readHouseOccupancy("manor", {
      baseUrl,
      secret: "occupancy-secret",
      now: new Date("2026-09-25T12:00:00.000Z"),
      timeoutMs: 2000,
    });
    assert.strictEqual(live.live, true);
    assert.strictEqual(live.unreachable, false);
    assert.strictEqual(live.syncedAt, "2026-09-25T12:00:00.000Z");
    assert.strictEqual(live.rooms.find((room) => room.name === "Holly")?.beds[0].patientName, "Holly Guest");
    assert.notStrictEqual(live.rooms.find((room) => room.name === "Holly")?.beds[0].patientName, "Bed 1");
    const willow = live.rooms.find((room) => room.name === "Willow");
    assert(willow && willow.capacity === 4);
    assert.ok(willow.beds.every((bed) => bed.status === "vacant"));

    const lodge = await readHouseOccupancy("lodge", { baseUrl, secret: "occupancy-secret", timeoutMs: 2000 });
    assert.strictEqual(lodge.rooms.find((room) => room.name === "Room 7")?.beds[0].patientName, "Lodge Guest");
    assert.strictEqual(lodge.rooms.some((room) => room.name === "Holly"), false, "Manor rooms stay off the Lodge board");

    const stale = await readHouseOccupancy("manor", {
      baseUrl: "http://127.0.0.1:1",
      secret: "occupancy-secret",
      timeoutMs: 400,
    });
    assert.strictEqual(stale.unreachable, true);
    assert.strictEqual(stale.known, true);
    assert.strictEqual(stale.rooms.find((room) => room.name === "Holly")?.beds[0].patientName, "Holly Guest");
    assert.ok(stale.syncedAtLabel, "Unreachable Within still shows when occupancy last synced");

    productionShape = true;
    const manorWaiting = await readHouseOccupancy("manor", {
      baseUrl,
      secret: "occupancy-secret",
      timeoutMs: 2000,
    });
    assert.strictEqual(manorWaiting.occupied, 23, "Unassigned residents count as occupied");
    assert.strictEqual(manorWaiting.available, 0, "Available beds do not go below zero");
    assert.strictEqual(manorWaiting.unassignedCount, 23);
    assert.strictEqual(unassignedNotice(manorWaiting.unassignedCount), "23 residents not yet allocated to a bed in Within");
    assert.ok(manorWaiting.rooms.find((room) => room.name === "Willow")?.beds.every((bed) => bed.status === "vacant"));
    assert.strictEqual(manorWaiting.rooms.some((room) => room.name === "Room 1"), false);

    const lodgeWaiting = await readHouseOccupancy("lodge", {
      baseUrl,
      secret: "occupancy-secret",
      timeoutMs: 2000,
    });
    assert.strictEqual(lodgeWaiting.occupied, 12);
    assert.strictEqual(lodgeWaiting.available, 4, "Lodge is not shown as 16 beds free");
    assert.strictEqual(lodgeWaiting.unassignedCount, 12);
    assert.strictEqual(lodgeWaiting.rooms.some((room) => room.name === "Willow"), false);

    clearOccupancyCache();
    const none = await readHouseOccupancy("lodge", {
      baseUrl: "http://127.0.0.1:1",
      secret: "occupancy-secret",
      timeoutMs: 400,
    });
    assert.strictEqual(none.known, false);
    assert.strictEqual(none.occupied, 0);
    assert.strictEqual(none.available, 0);
    assert.ok(none.rooms.every((room) => room.beds.every((bed) => bed.status === "unknown")));
    assert.strictEqual(none.rooms.some((room) => room.name === "Willow"), false);

    const crashed = await readHouseOccupancy("manor", {
      fetchImpl: async () => {
        throw new Error("socket hang up");
      },
    });
    assert.strictEqual(crashed.known, false);
    assert.strictEqual(crashed.unreachable, true);
  } finally {
    clearOccupancyCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  assert.strictEqual(resolveUploadsRoot({ REACH_DB_PATH: "/data/reach.db" }), "/data/uploads");
  assert.strictEqual(documentReachPath("doc 1", "https://reach.example"), "https://reach.example/api/documents/doc%201");
  assert.ok(contentDispositionFor("application/pdf", "history.pdf").startsWith("inline"));
  const authed = new Request("https://reach.example/api/documents/doc", {
    headers: { Authorization: "Bearer occupancy-secret" },
  });
  const headerAuth = new Request("https://reach.example/api/documents/doc", {
    headers: { "X-Reach-Handoff-Secret": "occupancy-secret" },
  });
  assert.strictEqual(requestHasHandoffSecret(authed, "occupancy-secret"), true);
  assert.strictEqual(requestHasHandoffSecret(headerAuth, "occupancy-secret"), true);
  assert.strictEqual(requestHasHandoffSecret(new Request("https://reach.example/api/documents/doc"), "occupancy-secret"), false);
}

async function headerNames(body: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  const values = (sheet?.getRow(1).values ?? []) as unknown[];
  return { sheet, headers: values.slice(1).map((value) => String(value ?? "")) };
}

async function runHistoryAndExportQa() {
  assert.strictEqual(
    classifyHistory({ stage: "admit", admitted_at: "", archived_at: "" }, false),
    "admitted",
  );
  assert.strictEqual(
    classifyHistory({ stage: "resident", admitted_at: "", archived_at: "" }, false),
    "admitted",
  );
  assert.strictEqual(
    classifyHistory({ stage: "archived", admitted_at: "2026-09-01T00:00:00.000Z", archived_at: "2026-09-20T00:00:00.000Z" }, false),
    "admitted",
    "Discharged after admission stays on Admitted",
  );
  assert.strictEqual(
    classifyHistory({ stage: "archived", admitted_at: "", archived_at: "2026-09-20T00:00:00.000Z" }, true),
    "admitted",
    "A past admit in audit history counts even after archive",
  );
  assert.strictEqual(
    classifyHistory({ stage: "archived", admitted_at: "", archived_at: "2026-09-20T00:00:00.000Z" }, false),
    "not_admitted",
  );
  assert.strictEqual(
    classifyHistory({ stage: "enquiry", admitted_at: "", archived_at: "" }, false),
    "open",
    "Open enquiries are not the Not admitted list",
  );
  assert.strictEqual(
    classifyHistory({ stage: "next_steps", admitted_at: "", archived_at: "" }, false),
    "open",
  );

  const closedId = "p_qa_not_admitted";
  const pastId = "p_qa_past_admit";
  const undoneId = "p_qa_undone_admit";
  const nursingId = "p_qa_nursing_days";
  const detoxId = "p_qa_detox_keep";
  for (const id of [closedId, pastId, undoneId, nursingId, detoxId]) {
    getDb().prepare(`DELETE FROM audit_events WHERE entity_id = ?`).run(id);
    getDb().prepare(`DELETE FROM people WHERE id = ?`).run(id);
  }

  insertPerson(
    qaPerson({
      id: closedId,
      first_name: "Closed",
      last_name: "Enquiry",
      stage: "archived",
    }),
  );
  getDb()
    .prepare(
      `UPDATE people
       SET stage = 'archived',
           lead_source = 'gp',
           not_converted_reason = 'unresponsive',
           archived_at = '2026-09-20T09:00:00.000Z',
           admitted_at = ''
       WHERE id = ?`,
    )
    .run(closedId);
  insertPerson(
    qaPerson({
      id: pastId,
      first_name: "Past",
      last_name: "Admit",
      stage: "archived",
    }),
  );
  getDb()
    .prepare(`UPDATE people SET stage = 'archived', archived_at = '2026-09-21T09:00:00.000Z', admitted_at = '' WHERE id = ?`)
    .run(pastId);
  const past = findPersonByName("Past", "Admit");
  assert(past, "Past admit fixture");
  writeAudit({
    personId: past.id,
    action: "stage_move",
    summary: "Moved to Admit",
    actorId: actor.id,
    before: { ...past, stage: "enquiry" },
    after: { ...past, stage: "admit" },
  });
  insertPerson(
    qaPerson({
      id: undoneId,
      first_name: "Undone",
      last_name: "Admit",
      stage: "archived",
    }),
  );
  getDb()
    .prepare(
      `UPDATE people
       SET stage = 'archived', archived_at = '2026-09-19T09:00:00.000Z', admitted_at = '', not_converted_reason = 'chose_competitor'
       WHERE id = ?`,
    )
    .run(undoneId);
  const undonePerson = findPersonByName("Undone", "Admit");
  assert(undonePerson, "Undone admit fixture");
  const undoneMove = writeAudit({
    personId: undonePerson.id,
    action: "stage_move",
    summary: "Moved to Admit",
    actorId: actor.id,
    before: { ...undonePerson, stage: "enquiry" },
    after: { ...undonePerson, stage: "admit" },
  });
  getDb().prepare(`UPDATE audit_events SET undone = 1 WHERE id = ?`).run(undoneMove.id);

  const admittedIds = new Set(listAdmittedHistory().map((person) => person.id));
  const notAdmittedIds = new Set(listNotAdmittedHistory().map((person) => person.id));
  const noah = findPersonByName("Noah", "Botha");
  const ameliaNow = findPersonByName("Amelia", "Hart");
  const priya = findPersonByName("Priya", "Naidoo");
  assert(noah && ameliaNow && priya);
  assert(admittedIds.has(noah.id), "Current Admit stage is Admitted history");
  assert(admittedIds.has(ameliaNow.id), "Current resident is Admitted history");
  assert(admittedIds.has(past.id), "Audit evidence of Admit counts after archive");
  assert(!notAdmittedIds.has(past.id), "Past admission is not Not admitted");
  assert(notAdmittedIds.has(closedId), "Archived enquiry without admission is Not admitted");
  assert(notAdmittedIds.has(undoneId), "An undone move to Admit does not count as admission");
  assert(!admittedIds.has(undoneId));
  assert(!admittedIds.has(priya.id) && !notAdmittedIds.has(priya.id), "Open enquiry stays off both history tabs");
  const closedCard = listNotAdmittedHistory().find((person) => person.id === closedId);
  assert(closedCard);
  assert.strictEqual(closedCard.not_converted_reason, "unresponsive");
  assert.strictEqual(closedCard.lead_source, "gp");

  const when = new Date("2026-09-26T08:00:00.000Z");
  const closedExport = await handleListExport("not-admitted", actor, new URLSearchParams(), { now: when });
  assert.strictEqual(closedExport.ok, true);
  if (closedExport.ok) {
    assert.strictEqual(closedExport.filename, "reach-not-admitted-2026-09-26.xlsx");
    assert.strictEqual(closedExport.body[0], 0x50);
    assert.strictEqual(closedExport.body[1], 0x4b);
    const { headers } = await headerNames(closedExport.body);
    assert.deepStrictEqual(headers.slice(0, 4), ["Name", "Lead source", "Not converted reason", "Closed"]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(closedExport.body as unknown as ExcelJS.Buffer);
    const names = workbook.worksheets[0].getColumn(1).values.map((value) => String(value ?? ""));
    assert(names.includes("Closed Enquiry"), "Not admitted export includes the archived enquiry");
  }
  const exportAudit = getDb()
    .prepare(`SELECT * FROM audit_events WHERE action = 'export' AND entity_id = 'not-admitted' ORDER BY created_at DESC LIMIT 1`)
    .get() as { actor_id: string; entity_type: string; before_json: string; summary: string };
  assert.strictEqual(exportAudit.entity_type, "list");
  assert.strictEqual(exportAudit.actor_id, actor.id);
  assert.strictEqual(exportAudit.before_json, "null");
  assert(exportAudit.summary.includes("reach-not-admitted-2026-09-26.xlsx"));
  const exportUndo = undoEvent(String((getDb().prepare(`SELECT id FROM audit_events WHERE action = 'export' ORDER BY created_at DESC LIMIT 1`).get() as { id: string }).id), actor.id);
  assert.strictEqual(exportUndo.ok, false);

  const therapist = findUserById("user_therapist");
  const executive = findUserById("user_executive");
  assert(therapist && executive);
  const beforeCreditorExports = (
    getDb().prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'export' AND entity_id = 'creditors'`).get() as { n: number }
  ).n;
  const denied = await handleListExport("creditors", therapist, new URLSearchParams(), { now: when });
  assert.strictEqual(denied.ok, false);
  if (!denied.ok) assert.strictEqual(denied.status, 403);
  const afterDenied = (
    getDb().prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'export' AND entity_id = 'creditors'`).get() as { n: number }
  ).n;
  assert.strictEqual(afterDenied, beforeCreditorExports, "A refused export is not logged");
  const allowed = await handleListExport("creditors", executive, new URLSearchParams(), { now: when });
  assert.strictEqual(allowed.ok, true);
  if (allowed.ok) {
    assert.strictEqual(allowed.filename, "reach-creditors-2026-09-26.xlsx");
    const { headers } = await headerNames(allowed.body);
    assert(headers.includes("Name") && headers.includes("Account reference"));
  }
  const anon = await handleListExport("enquiries", null, new URLSearchParams());
  assert.strictEqual(anon.ok, false);
  if (!anon.ok) assert.strictEqual(anon.status, 401);
  const unknown = await handleListExport("executive", actor, new URLSearchParams());
  assert.strictEqual(unknown.ok, false);
  if (!unknown.ok) assert.strictEqual(unknown.status, 404);
  const accountsExport = await handleListExport("accounts", therapist, new URLSearchParams("group=phase_1"), { now: when });
  assert.strictEqual(accountsExport.ok, true, "Accounts export follows the staff page, not the creditors role");
  const enquiriesExport = await handleListExport("enquiries", actor, new URLSearchParams(), { now: when });
  assert.strictEqual(enquiriesExport.ok, true);
  if (enquiriesExport.ok) {
    assert.match(enquiriesExport.filename, /^reach-enquiries-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const { headers } = await headerNames(enquiriesExport.body);
    assert(headers.includes("Lead source") && headers.includes("Enquiry date"));
  }

  const manorExport = await handleListExport("manor", actor, new URLSearchParams(), {
    now: when,
    readOccupancy: async () => ({
      house: "manor",
      capacity: 22,
      occupied: 1,
      bedOccupied: 1,
      available: 21,
      unassignedCount: 0,
      unassigned: [],
      rooms: [
        {
          name: "Willow",
          capacity: 1,
          occupied: 1,
          beds: [
            {
              id: "bed-willow",
              label: "Bed A",
              status: "occupied",
              patientName: "Willow Guest",
              clientId: "within-willow",
              admissionDate: "2026-09-02",
              reachPersonId: "",
            },
          ],
        },
      ],
      syncedAt: "2026-09-26T08:00:00.000Z",
      syncedAtLabel: "26 Sep",
      live: true,
      unreachable: false,
      known: true,
    }),
  });
  assert.strictEqual(manorExport.ok, true);
  if (manorExport.ok) {
    assert.strictEqual(manorExport.filename, "reach-manor-2026-09-26.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(manorExport.body as unknown as ExcelJS.Buffer);
    const patient = workbook.worksheets[0].getColumn(4).values.map((value) => String(value ?? ""));
    assert(patient.includes("Willow Guest"));
  }

  insertPerson(
    qaPerson({
      id: nursingId,
      first_name: "Nursing",
      last_name: "Days",
      stage: "enquiry",
      lead_source: "family",
      commercial_notes: "Keep nursing note",
      addon_nursing_medical_admission: 1,
      addon_nursing_days: 8,
    }),
  );
  getDb()
    .prepare(
      `UPDATE people
       SET addon_nursing_medical_admission = 1,
           addon_nursing_days = 8,
           commercial_notes = 'Keep nursing note',
           lead_source = 'family'
       WHERE id = ?`,
    )
    .run(nursingId);
  clampNursingAddonDays(getDb());
  const clamped = findPersonByName("Nursing", "Days");
  assert(clamped);
  assert.strictEqual(clamped.addon_nursing_days, 1, "Nursing days above 1 collapse to a single day");
  assert.strictEqual(clamped.addon_nursing_medical_admission, 1);
  assert.strictEqual(clamped.commercial_notes, "Keep nursing note");
  assert.strictEqual(clamped.lead_source, "family");
  clampNursingAddonDays(getDb());
  assert.strictEqual(findPersonByName("Nursing", "Days")?.addon_nursing_days, 1, "Nursing day clamp is idempotent");

  const form = new FormData();
  form.set("first_name", "Nursing");
  form.set("last_name", "Days");
  form.set("addon_nursing_medical_admission", "1");
  form.set("detox_first", "1");
  form.set("expected_detox_nights", "4");
  const built = buildCommercialDetailsPatch(form);
  assert.strictEqual(built.ok, true);
  if (built.ok) {
    assert.strictEqual(built.patch.addon_nursing_medical_admission, 1);
    assert.strictEqual(built.patch.addon_nursing_days, 1);
    assert.strictEqual("detox_first" in built.patch, false, "Commercial save does not edit the treatment detox flag");
    assert.strictEqual("expected_detox_nights" in built.patch, false);
  }
  const off = new FormData();
  const cleared = buildCommercialDetailsPatch(off);
  assert.strictEqual(cleared.ok, true);
  if (cleared.ok) {
    assert.strictEqual(cleared.patch.addon_nursing_medical_admission, 0);
    assert.strictEqual(cleared.patch.addon_nursing_days, 0);
  }

  insertPerson(
    qaPerson({
      id: detoxId,
      first_name: "Detox",
      last_name: "Keep",
      stage: "resident",
      house: "manor",
      room_id: roomId("manor", "Willow"),
      admission_kind: "program",
      detox_first: 1,
      expected_detox_nights: 4,
      admitted_at: "2026-09-20T00:00:00.000Z",
    }),
  );
  const kept = applyPersonPatch(detoxId, { commercial_notes: "notes only" }, actor, "field_edit", "Notes");
  assert.strictEqual(kept.ok, true);
  if (kept.ok) {
    assert.strictEqual(kept.person.detox_first, 1);
    assert.strictEqual(kept.person.expected_detox_nights, 4);
    const claims = claimsForPerson(kept.person);
    assert.strictEqual(claims?.expectedDetoxNights, 4);
    assert.strictEqual(claims?.detoxFirst, true);
    assert.strictEqual(claims?.detoxIntent, "detox_first");
  }

  const editor = readFileSync("src/components/PersonEditor.tsx", "utf8");
  assert.strictEqual(editor.includes("DetoxAddonFields"), false);
  assert(editor.includes("Detox/overnight supervision"));
  assert(editor.includes("Nursing & medical admission"));
  assert(!editor.includes("daysName=\"addon_nursing_days\""));
  assert(editor.indexOf("Lead source") < editor.indexOf(">Referrer<"));
  const personPage = readFileSync("src/app/people/[id]/page.tsx", "utf8");
  assert(personPage.indexOf("<ArpFields") < personPage.indexOf("<StageMove"));
  assert(personPage.indexOf("<StageMove") < personPage.indexOf("<TransferExtensionForm"));
  assert.strictEqual(personPage.includes("LeadSourceForm"), false);
  const nav = readFileSync("src/lib/labels.ts", "utf8");
  assert(nav.indexOf('label: "Admit"') < nav.indexOf('label: "Admitted"'));
  assert(nav.indexOf('label: "Admitted"') < nav.indexOf('label: "Not admitted"'));
  assert(nav.indexOf('label: "Not admitted"') < nav.indexOf('label: "Manor (22)"'));

  for (const id of [closedId, pastId, undoneId, nursingId, detoxId]) {
    getDb().prepare(`DELETE FROM audit_events WHERE entity_id = ?`).run(id);
    getDb().prepare(`DELETE FROM people WHERE id = ?`).run(id);
  }
}

assertLeadForms()
  .then(() => runHistoryAndExportQa())
  .then(() => runMockedWithinSend())
  .then(() => runOccupancyQa())
  .then(() => {
    console.log("QA assertions passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
