import {
  ACCOUNTING_COMPANIES,
  type AccountingCompanyId,
  type AccountingConnector,
  type ConnectorResult,
  type CreditorSyncPayload,
  type ProfitAndLossLine,
  LIBERTY_TENANT,
  connectorForTenant,
} from "./accounting/connector";
import { canViewCreditors } from "./access";
import { getDb } from "./db";
import { HOUSE_LABEL } from "./labels";
import { newId } from "./passwords";
import type { User } from "./types";
import { findUserById } from "./users";

const CREDITOR_DENIED = "Creditors are limited to executive and finance.";

export type CreditorSyncState = "local" | "pending_push" | "synced";

export type Creditor = {
  id: string;
  name: string;
  facility: AccountingCompanyId | "";
  contact_name: string;
  email: string;
  phone: string;
  account_reference: string;
  notes: string;
  external_id: string;
  sync_state: CreditorSyncState;
  sync_note: string;
  last_sync_at: string;
  created_at: string;
  updated_at: string;
};

export type CreditorInput = {
  name: string;
  facility: AccountingCompanyId | "";
  contactName: string;
  email: string;
  phone: string;
  accountReference: string;
  notes: string;
};

export type PnlStripLine = {
  company: AccountingCompanyId;
  label: string;
  currency: string | null;
  revenue: number | null;
  profitLoss: number | null;
  sourcedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type PnlStrip = {
  connectorId: string;
  connectorLabel: string;
  /** True only after a connector has stored a real revenue or profit/loss figure. */
  wired: boolean;
  lines: PnlStripLine[];
};

function nowIso() {
  return new Date().toISOString();
}

function monthBounds(asOf = new Date()) {
  const day = asOf.toISOString().slice(0, 10);
  const start = `${day.slice(0, 7)}-01`;
  return { periodStart: start, periodEnd: day };
}

function creditorActor(actorId: string) {
  const user = findUserById(actorId);
  if (!user || user.auth_disabled || !canViewCreditors(user)) return null;
  return user;
}

/** Creditor rows and the profit-and-loss strip. Refuses every other role, including admissions manager. */
export function loadCreditorView(user: Pick<User, "role">) {
  if (!canViewCreditors(user)) return { ok: false as const, error: CREDITOR_DENIED };
  return { ok: true as const, creditors: listCreditors(), pnl: readProfitAndLossStrip() };
}

export function listCreditors(): Creditor[] {
  return getDb().prepare(`SELECT * FROM creditors ORDER BY name ASC`).all() as Creditor[];
}

export function getCreditor(id: string): Creditor | null {
  return (getDb().prepare(`SELECT * FROM creditors WHERE id = ?`).get(id) as Creditor | undefined) ?? null;
}

function writeSyncLog(input: {
  connector: AccountingConnector;
  direction: "push" | "pull";
  entityType: string;
  entityId: string;
  company: string;
  status: string;
  message: string;
  actorId: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO accounting_sync_log (
        id, connector_id, direction, entity_type, entity_id, company, status, message, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("syn"),
      input.connector.id,
      input.direction,
      input.entityType,
      input.entityId,
      input.company,
      input.status,
      input.message,
      input.actorId,
      nowIso(),
    );
}

function toPayload(creditor: Creditor): CreditorSyncPayload {
  return {
    reachId: creditor.id,
    externalId: creditor.external_id,
    name: creditor.name,
    facility: creditor.facility,
    contactName: creditor.contact_name,
    email: creditor.email,
    phone: creditor.phone,
    accountReference: creditor.account_reference,
    notes: creditor.notes,
  };
}

function markSync(id: string, state: CreditorSyncState, note: string, externalId?: string) {
  const at = nowIso();
  if (externalId) {
    getDb()
      .prepare(
        `UPDATE creditors
         SET sync_state = ?, sync_note = ?, last_sync_at = ?, external_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(state, note, at, externalId, at, id);
    return;
  }
  getDb()
    .prepare(
      `UPDATE creditors SET sync_state = ?, sync_note = ?, last_sync_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(state, note, at, at, id);
}

function pushCreditor(creditor: Creditor, actorId: string, connector = connectorForTenant()) {
  const result = connector.pushCreditor(toPayload(creditor));
  if (result.ok) {
    markSync(creditor.id, "synced", "Pushed to accounting.", result.data.externalId || creditor.external_id);
  } else {
    markSync(creditor.id, "pending_push", result.message);
  }
  writeSyncLog({
    connector,
    direction: "push",
    entityType: "creditor",
    entityId: creditor.id,
    company: creditor.facility,
    status: result.status,
    message: result.ok ? "Pushed creditor." : result.message,
    actorId,
  });
  return result;
}

export function createCreditor(input: CreditorInput, actorId: string) {
  if (!creditorActor(actorId)) return { ok: false as const, error: CREDITOR_DENIED };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Creditor name is required." };
  const at = nowIso();
  const creditor: Creditor = {
    id: newId("crd"),
    name,
    facility: input.facility,
    contact_name: input.contactName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    account_reference: input.accountReference.trim(),
    notes: input.notes.trim(),
    external_id: "",
    sync_state: "local",
    sync_note: "",
    last_sync_at: "",
    created_at: at,
    updated_at: at,
  };
  getDb()
    .prepare(
      `INSERT INTO creditors (
        id, name, facility, contact_name, email, phone, account_reference, notes,
        external_id, sync_state, sync_note, last_sync_at, created_at, updated_at
      ) VALUES (
        @id, @name, @facility, @contact_name, @email, @phone, @account_reference, @notes,
        @external_id, @sync_state, @sync_note, @last_sync_at, @created_at, @updated_at
      )`,
    )
    .run(creditor);
  const sync = pushCreditor(creditor, actorId);
  return { ok: true as const, creditor: getCreditor(creditor.id)!, sync };
}

export function updateCreditor(id: string, input: CreditorInput, actorId: string) {
  if (!creditorActor(actorId)) return { ok: false as const, error: CREDITOR_DENIED };
  const existing = getCreditor(id);
  if (!existing) return { ok: false as const, error: "Creditor not found." };
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Creditor name is required." };
  const at = nowIso();
  getDb()
    .prepare(
      `UPDATE creditors SET
        name = ?, facility = ?, contact_name = ?, email = ?, phone = ?,
        account_reference = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      input.facility,
      input.contactName.trim(),
      input.email.trim(),
      input.phone.trim(),
      input.accountReference.trim(),
      input.notes.trim(),
      at,
      id,
    );
  const next = getCreditor(id)!;
  const sync = pushCreditor(next, actorId);
  return { ok: true as const, creditor: getCreditor(id)!, sync };
}

export function deleteCreditor(id: string, actorId: string) {
  if (!creditorActor(actorId)) return { ok: false as const, error: CREDITOR_DENIED };
  const existing = getCreditor(id);
  if (!existing) return { ok: false as const, error: "Creditor not found." };
  const connector = connectorForTenant();
  const sync = connector.pushCreditorDelete({
    reachId: existing.id,
    externalId: existing.external_id,
    facility: existing.facility,
  });
  writeSyncLog({
    connector,
    direction: "push",
    entityType: "creditor",
    entityId: existing.id,
    company: existing.facility,
    status: sync.status,
    message: sync.ok ? "Deleted in accounting." : sync.message,
    actorId,
  });
  getDb().prepare(`DELETE FROM creditors WHERE id = ?`).run(id);
  return { ok: true as const, sync };
}

function upsertPulled(record: CreditorSyncPayload) {
  const at = nowIso();
  const existing = record.externalId
    ? ((getDb().prepare(`SELECT * FROM creditors WHERE external_id = ?`).get(record.externalId) as Creditor | undefined) ??
      null)
    : null;
  if (existing) {
    getDb()
      .prepare(
        `UPDATE creditors SET
          name = ?, facility = ?, contact_name = ?, email = ?, phone = ?,
          account_reference = ?, notes = ?, sync_state = 'synced', sync_note = ?,
          last_sync_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        record.name,
        record.facility,
        record.contactName,
        record.email,
        record.phone,
        record.accountReference,
        record.notes,
        "Pulled from accounting.",
        at,
        at,
        existing.id,
      );
    return existing.id;
  }
  const id = record.reachId || newId("crd");
  getDb()
    .prepare(
      `INSERT INTO creditors (
        id, name, facility, contact_name, email, phone, account_reference, notes,
        external_id, sync_state, sync_note, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?)`,
    )
    .run(
      id,
      record.name,
      record.facility,
      record.contactName,
      record.email,
      record.phone,
      record.accountReference,
      record.notes,
      record.externalId,
      "Pulled from accounting.",
      at,
      at,
      at,
    );
  return id;
}

function storePnl(connector: AccountingConnector, line: ProfitAndLossLine) {
  if (line.revenue === null && line.profitLoss === null) return false;
  getDb()
    .prepare(
      `INSERT INTO accounting_pnl (
        id, connector_id, company, period_start, period_end, currency, revenue, profit_loss, sourced_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("pnl"),
      connector.id,
      line.company,
      line.periodStart,
      line.periodEnd,
      line.currency,
      line.revenue,
      line.profitLoss,
      line.sourcedAt ?? "",
      nowIso(),
    );
  return true;
}

export function pullAccounting(actorId: string, asOf = new Date()) {
  if (!creditorActor(actorId)) return { ok: false as const, imported: 0, message: CREDITOR_DENIED };
  const connector = connectorForTenant(LIBERTY_TENANT);
  const { periodStart, periodEnd } = monthBounds(asOf);
  let imported = 0;
  const messages: string[] = [];
  for (const company of ACCOUNTING_COMPANIES) {
    const pulled = connector.pullCreditors(company);
    writeSyncLog({
      connector,
      direction: "pull",
      entityType: "creditor",
      entityId: "",
      company,
      status: pulled.status,
      message: pulled.ok ? `Pulled ${pulled.data.length} creditors.` : pulled.message,
      actorId,
    });
    if (pulled.ok) {
      for (const record of pulled.data) {
        upsertPulled({ ...record, facility: record.facility || company });
        imported += 1;
      }
    } else {
      messages.push(pulled.message);
    }

    const pnl: ConnectorResult<ProfitAndLossLine> = connector.pullProfitAndLoss({
      company,
      periodStart,
      periodEnd,
    });
    const stored = pnl.ok ? storePnl(connector, pnl.data) : false;
    writeSyncLog({
      connector,
      direction: "pull",
      entityType: "profit_and_loss",
      entityId: "",
      company,
      status: pnl.status,
      message: pnl.ok
        ? stored
          ? "Stored profit and loss from accounting."
          : "Connector returned no revenue or profit/loss figures."
        : pnl.message,
      actorId,
    });
    if (!pnl.ok) messages.push(pnl.message);
  }
  const unique = [...new Set(messages)];
  return {
    ok: true as const,
    imported,
    message:
      unique.length > 0
        ? unique.join(" ")
        : imported > 0
          ? `Pulled ${imported} creditor${imported === 1 ? "" : "s"} from ${connector.label}.`
          : `Pull from ${connector.label} finished. No creditor rows and no profit or loss figures were returned.`,
  };
}

type PnlRow = {
  currency: string;
  revenue: number | null;
  profit_loss: number | null;
  sourced_at: string;
  period_start: string;
  period_end: string;
};

export function readProfitAndLossStrip(connector = connectorForTenant()): PnlStrip {
  const lines = ACCOUNTING_COMPANIES.map((company) => {
    const row =
      (getDb()
        .prepare(
          `SELECT currency, revenue, profit_loss, sourced_at, period_start, period_end
           FROM accounting_pnl
           WHERE connector_id = ? AND company = ?
             AND (revenue IS NOT NULL OR profit_loss IS NOT NULL)
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(connector.id, company) as PnlRow | undefined) ?? null;
    return {
      company,
      label: HOUSE_LABEL[company],
      currency: row?.currency || null,
      revenue: row?.revenue ?? null,
      profitLoss: row?.profit_loss ?? null,
      sourcedAt: row?.sourced_at || null,
      periodStart: row?.period_start || null,
      periodEnd: row?.period_end || null,
    };
  });
  return {
    connectorId: connector.id,
    connectorLabel: connector.label,
    wired: lines.some((line) => line.revenue !== null || line.profitLoss !== null),
    lines,
  };
}

export function clearAccountingFixtures(connectorId: string) {
  getDb().prepare(`DELETE FROM accounting_pnl WHERE connector_id = ?`).run(connectorId);
  getDb().prepare(`DELETE FROM accounting_sync_log WHERE connector_id = ?`).run(connectorId);
}
