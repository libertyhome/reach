/**
 * Bidirectional accounting sync contract.
 *
 * Liberty Home default tenant (`liberty`) uses Sage for the Manor and Lodge
 * companies. Reach Base and other tenants register their own connector with
 * the same interface — Reach does not assume a second ERP.
 *
 * The Sage methods are stubs until the ledger API is wired. They must not
 * invent revenue, profit, or creditor balances.
 */

export const LIBERTY_TENANT = "liberty";
export const SAGE_CONNECTOR_ID = "sage";

export const ACCOUNTING_COMPANIES = ["manor", "lodge"] as const;
export type AccountingCompanyId = (typeof ACCOUNTING_COMPANIES)[number];

export type CreditorSyncPayload = {
  reachId: string;
  externalId: string;
  name: string;
  facility: AccountingCompanyId | "";
  contactName: string;
  email: string;
  phone: string;
  accountReference: string;
  notes: string;
};

export type ProfitAndLossLine = {
  company: AccountingCompanyId;
  periodStart: string;
  periodEnd: string;
  currency: string;
  /** Null until the connector returns a ledger figure. */
  revenue: number | null;
  /** Null until the connector returns a ledger figure. Negative is a loss. */
  profitLoss: number | null;
  sourcedAt: string | null;
};

export type ConnectorResult<T> =
  | { ok: true; status: "ok"; data: T }
  | { ok: false; status: "not_wired" | "error"; message: string };

export interface AccountingConnector {
  readonly id: string;
  readonly label: string;
  /** Reach change → accounting. */
  pushCreditor(payload: CreditorSyncPayload): ConnectorResult<{ externalId: string }>;
  /** Reach delete → accounting. */
  pushCreditorDelete(payload: {
    reachId: string;
    externalId: string;
    facility: AccountingCompanyId | "";
  }): ConnectorResult<{ deleted: boolean }>;
  /** Accounting change → Reach. */
  pullCreditors(company: AccountingCompanyId): ConnectorResult<CreditorSyncPayload[]>;
  pullProfitAndLoss(input: {
    company: AccountingCompanyId;
    periodStart: string;
    periodEnd: string;
  }): ConnectorResult<ProfitAndLossLine>;
}

const NOT_WIRED =
  "Sage is not wired. Nothing was sent to or read from the Manor or Lodge companies.";

export class SageConnector implements AccountingConnector {
  readonly id = SAGE_CONNECTOR_ID;
  readonly label = "Sage";

  pushCreditor(): ConnectorResult<{ externalId: string }> {
    return { ok: false, status: "not_wired", message: NOT_WIRED };
  }

  pushCreditorDelete(): ConnectorResult<{ deleted: boolean }> {
    return { ok: false, status: "not_wired", message: NOT_WIRED };
  }

  pullCreditors(): ConnectorResult<CreditorSyncPayload[]> {
    return { ok: false, status: "not_wired", message: NOT_WIRED };
  }

  pullProfitAndLoss(): ConnectorResult<ProfitAndLossLine> {
    return { ok: false, status: "not_wired", message: NOT_WIRED };
  }
}

export const sageConnector = new SageConnector();

const registry = new Map<string, AccountingConnector>([[LIBERTY_TENANT, sageConnector]]);

/** Pluggable per tenant. Liberty stays on Sage unless a host replaces it. */
export function registerAccountingConnector(tenantKey: string, connector: AccountingConnector) {
  registry.set(tenantKey, connector);
}

export function connectorForTenant(tenantKey = LIBERTY_TENANT): AccountingConnector {
  return registry.get(tenantKey) ?? sageConnector;
}
