import {
  createCreditorAction,
  deleteCreditorAction,
  pullAccountingAction,
  updateCreditorAction,
} from "@/app/creditor-actions";
import type { Creditor, PnlStrip } from "@/lib/creditors";
import { HOUSE_SHORT } from "@/lib/labels";

const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-line bg-linen px-3";

function figure(value: number | null, currency: string | null) {
  if (value === null) return "—";
  if (!currency) return value.toLocaleString("en-ZA");
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-ZA")}`;
  }
}

function CreditorFields({ creditor }: { creditor?: Creditor | null }) {
  return (
    <>
      <label className="block text-sm sm:col-span-2">
        Name
        <input name="name" required defaultValue={creditor?.name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Sage company
        <select name="facility" defaultValue={creditor?.facility ?? ""} className={inputClass}>
          <option value="">Unassigned</option>
          <option value="manor">{HOUSE_SHORT.manor}</option>
          <option value="lodge">{HOUSE_SHORT.lodge}</option>
        </select>
      </label>
      <label className="block text-sm">
        Account reference
        <input name="accountReference" defaultValue={creditor?.account_reference ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Contact
        <input name="contactName" defaultValue={creditor?.contact_name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Email
        <input name="email" type="email" defaultValue={creditor?.email ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm">
        Phone
        <input name="phone" defaultValue={creditor?.phone ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm sm:col-span-2">
        Notes
        <textarea name="notes" rows={3} defaultValue={creditor?.notes ?? ""} className={inputClass} />
      </label>
    </>
  );
}

export function CreditorsBoard({
  creditors,
  editing,
  pnl,
  notice,
}: {
  creditors: Creditor[];
  editing: Creditor | null;
  pnl: PnlStrip;
  notice?: string;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Creditors</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Creditor records live in Reach. Liberty syncs with Sage for the Manor and Lodge companies. Profit and
            loss stays blank until that sync returns figures.
          </p>
        </div>
        <form action={pullAccountingAction}>
          <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
            Pull from {pnl.connectorLabel}
          </button>
        </form>
      </div>

      {notice ? (
        <p className="rounded-2xl border border-sage/30 bg-paper px-4 py-3 text-sm">{notice}</p>
      ) : null}

      <section className="rounded-3xl border border-line bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-2xl text-sage-deep">Profit and loss</h2>
          <p className="text-xs uppercase tracking-wider text-muted">{pnl.connectorLabel}</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {pnl.lines.map((line) => (
            <article key={line.company} className="rounded-2xl bg-linen px-4 py-3">
              <p className="text-sm text-muted">{line.label}</p>
              <dl className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs uppercase tracking-wider text-muted">Revenue</dt>
                  <dd className="serif text-2xl text-sage-deep">{figure(line.revenue, line.currency)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs uppercase tracking-wider text-muted">Profit / loss</dt>
                  <dd className="serif text-2xl">{figure(line.profitLoss, line.currency)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">
                {line.sourcedAt ? `Sourced ${line.sourcedAt.slice(0, 10)}` : "Not synced"}
              </p>
            </article>
          ))}
        </div>
        {pnl.wired ? null : (
          <p className="mt-4 text-sm text-muted">
            No revenue or profit/loss has been stored. The Sage connector is a scaffold and does not invent figures.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-paper p-5">
        <h2 className="serif text-2xl text-sage-deep">{editing ? "Edit creditor" : "New creditor"}</h2>
        <form action={editing ? updateCreditorAction : createCreditorAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <CreditorFields creditor={editing} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="min-h-11 rounded-full bg-sage px-4 text-sm text-paper">
              {editing ? "Save and push" : "Add and push"}
            </button>
            {editing ? (
              <a href="/creditors" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
                Cancel
              </a>
            ) : null}
          </div>
        </form>
      </section>

      <section>
        <h2 className="serif text-2xl text-sage-deep">Records</h2>
        {creditors.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-dashed border-line p-6 text-muted">No creditors yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {creditors.map((creditor) => (
              <li key={creditor.id} className="rounded-3xl border border-line bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="serif text-2xl text-sage-deep">{creditor.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {creditor.facility === "manor" || creditor.facility === "lodge"
                        ? HOUSE_SHORT[creditor.facility]
                        : "Company unassigned"}
                      {creditor.account_reference ? ` · ${creditor.account_reference}` : ""}
                      {creditor.external_id ? ` · ${creditor.external_id}` : ""}
                    </p>
                  </div>
                  <p className="text-sm">{syncLabel(creditor.sync_state)}</p>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted">Contact</dt>
                    <dd>{creditor.contact_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted">Email</dt>
                    <dd>{creditor.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted">Phone</dt>
                    <dd>{creditor.phone || "—"}</dd>
                  </div>
                </dl>
                {creditor.notes ? <p className="mt-3 text-sm">{creditor.notes}</p> : null}
                {creditor.sync_note ? <p className="mt-2 text-sm text-muted">{creditor.sync_note}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`/creditors?edit=${creditor.id}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
                    Edit
                  </a>
                  <form action={deleteCreditorAction}>
                    <input type="hidden" name="id" value={creditor.id} />
                    <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm text-terracotta">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function syncLabel(state: Creditor["sync_state"]) {
  if (state === "synced") return "Synced";
  if (state === "pending_push") return "Pending push";
  return "Local only";
}
