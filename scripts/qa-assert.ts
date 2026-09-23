import assert from "assert";
import { execSync } from "child_process";
import { getDb } from "../src/lib/db";
import { FORBIDDEN_CLINICAL_FIELDS } from "../src/lib/field-gate";
import { claimsForPerson, signHandoff, verifyHandoff, withinClientIdFor } from "../src/lib/handoff";
import { occupancyParityRow, programPhaseFor } from "../src/lib/occupancy";
import { findPersonByName, occupancyCounts, roomOccupant } from "../src/lib/people";
import { applyPersonPatch, checklistComplete, confirmAdmit, updateLeadSource } from "../src/lib/pipeline";
import { listRooms } from "../src/lib/rooms";
import { seed } from "../src/lib/seed";
import { authenticate, findUserById } from "../src/lib/users";
import { listAudit, undoEvent } from "../src/lib/audit";
import { sessionTokenLooksValid } from "../src/lib/session";
import { COMMERCIAL_CHECKLIST } from "../src/lib/types";

getDb();
seed();

const amelia = findPersonByName("Amelia", "Hart");
assert(amelia, "Amelia Hart must be seeded");
assert.strictEqual(amelia.stage, "resident");
assert.strictEqual(amelia.house, "manor");
assert(amelia.room_id.endsWith("yew"), "Amelia Hart must be on Manor room Yew");
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
assert.strictEqual(occ.manor, 12, `Manor should be 12/21, got ${occ.manor}`);
assert.strictEqual(occ.lodge, 9, `Lodge should be 9/16, got ${occ.lodge}`);

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
  `Updated commercial checklist — ${accounts.name.split(/\s+/)[0]}`,
);
assert(checklistEdit.ok);
const history = listAudit(priya.id, 5);
assert(
  history.some((event) => event.summary.includes("Pieter") || findUserById(event.actor_id)?.name.includes("Pieter")),
  "History must retain actor for commercial checklist edits",
);
assert(
  COMMERCIAL_CHECKLIST.some((item) => item.key === "arf_signed"),
  "ARF signed must be on commercial checklist",
);
assert(
  COMMERCIAL_CHECKLIST.some((item) => item.key === "arp_signed"),
  "ARP signed must be on commercial checklist",
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
  "addon_psych_admission",
  "addon_overnight_supervision",
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
assert(tables.includes("person_documents"), "person_documents table required");

console.log("QA assertions passed.");
