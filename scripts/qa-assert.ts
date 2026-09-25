import assert from "assert";
import { execSync } from "child_process";
import http from "http";
import {
  type AccountingConnector,
  LIBERTY_TENANT,
  registerAccountingConnector,
  sageConnector,
} from "../src/lib/accounting/connector";
import { canSendToWithin, canViewCreditors, canViewExecutive } from "../src/lib/access";
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
import { findPersonByName, insertPerson, listPeople, occupancyCounts, roomOccupant } from "../src/lib/people";
import { applyPersonPatch, checklistComplete, confirmAdmit, updateLeadSource } from "../src/lib/pipeline";
import { listRooms } from "../src/lib/rooms";
import { seed } from "../src/lib/seed";
import { authenticate, findUserById, listUsers } from "../src/lib/users";
import { listAudit, undoEvent } from "../src/lib/audit";
import { sessionTokenLooksValid } from "../src/lib/session";
import { COMMERCIAL_CHECKLIST, type Person } from "../src/lib/types";
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
    contact_method: "phone",
    assigned_to_user_id: "user_admissions",
    counsellor_user_id: partial.counsellor_user_id ?? "",
    referral_owner_user_id: "user_admissions",
    referrer_name: partial.referrer_name ?? "",
    referrer_contact_person: partial.referrer_contact_person ?? "",
    referrer_phone: partial.referrer_phone ?? "",
    next_of_kin_name: partial.next_of_kin_name ?? "",
    next_of_kin_phone: partial.next_of_kin_phone ?? "",
    funding_type: partial.funding_type ?? "medical_aid",
    funding_notes: "",
    currency: "ZAR",
    expected_arrival: partial.expected_arrival ?? "",
    admission_date: partial.admission_date ?? "2026-10-02",
    planned_discharge_date: partial.planned_discharge_date ?? "2026-11-02",
    house_preference: partial.house_preference ?? "",
    preferred_room_id: partial.preferred_room_id ?? "",
    commercial_notes: "",
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
    addon_psych_admission: 0,
    addon_overnight_supervision: 0,
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
  reachHouseFor({ ...manorClient, house: "manor", room_id: "lodge-protea" }),
  null,
  "Confirmed Manor and a Lodge room must not send",
);
assert.strictEqual(
  reachHouseFor({ ...manorClient, house: "", house_preference: "manor", preferred_room_id: "lodge-protea" }),
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
  preferred_room_id: "lodge-protea",
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
    documents: { kind: string }[];
  };
  assert.ok(captured[0].authorization === `Bearer ${handoffSecretForTest}`, "Authorization must be the handoff bearer");
  assert.ok(!captured[0].body.includes(handoffSecretForTest), "Payload must not carry the handoff secret");
  assert.strictEqual(firstBody.reachClientId, manorClient.id);
  assert.strictEqual(typeof firstBody.documentsComplete, "boolean");
  assert.strictEqual(firstBody.house, "weltevreden_manor");
  assert.strictEqual(firstBody.phase, "2");
  assert.ok(!firstBody.documents.some((doc) => doc.kind === "coc"));

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

runMockedWithinSend()
  .then(() => {
    console.log("QA assertions passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
