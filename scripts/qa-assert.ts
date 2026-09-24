import assert from "assert";
import { execSync } from "child_process";
import {
  type AccountingConnector,
  LIBERTY_TENANT,
  registerAccountingConnector,
  sageConnector,
} from "../src/lib/accounting/connector";
import { canViewCreditors, canViewExecutive } from "../src/lib/access";
import { clearAccountingFixtures, createCreditor, pullAccounting, readProfitAndLossStrip } from "../src/lib/creditors";
import { getDb } from "../src/lib/db";
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
import { findPersonByName, listPeople, occupancyCounts, roomOccupant } from "../src/lib/people";
import { applyPersonPatch, checklistComplete, confirmAdmit, updateLeadSource } from "../src/lib/pipeline";
import { listRooms } from "../src/lib/rooms";
import { seed } from "../src/lib/seed";
import { authenticate, findUserById, listUsers } from "../src/lib/users";
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

const asOf = new Date("2026-09-24T12:00:00.000Z");
const roster = listPeople();
const staff = listUsers();
const snap = buildOccupancySnapshot(roster, asOf);
const manorOcc = snap.facilities.find((facility) => facility.house === "manor");
const lodgeOcc = snap.facilities.find((facility) => facility.house === "lodge");
assert(manorOcc && lodgeOcc, "Occupancy covers Manor and Lodge");
assert.strictEqual(manorOcc.capacity, 21);
assert.strictEqual(lodgeOcc.capacity, 16);
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

console.log("QA assertions passed.");
