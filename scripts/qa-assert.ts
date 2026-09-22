import assert from "assert";
import { execSync } from "child_process";
import { getDb } from "../src/lib/db";
import { FORBIDDEN_CLINICAL_FIELDS } from "../src/lib/field-gate";
import { claimsForPerson, signHandoff, verifyHandoff, withinClientIdFor } from "../src/lib/handoff";
import { occupancyParityRow, programPhaseFor } from "../src/lib/occupancy";
import { findPersonByName, occupancyCounts } from "../src/lib/people";
import { applyPersonPatch, checklistComplete, updateLeadSource } from "../src/lib/pipeline";
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
assert.strictEqual(verifyHandoff(signHandoff(ameliaClaims))?.reachClientId, amelia.id);
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
]) {
  assert(columns.includes(needed), `people table must have ${needed}`);
}

const tables = (
  getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
).map((row) => row.name);
assert(tables.includes("person_documents"), "person_documents table required");

console.log("QA assertions passed.");
