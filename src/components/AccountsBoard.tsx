import Link from "next/link";
import {
  accountRenewalAction,
  batchRaiseSageInvoiceAction,
  raiseSageInvoiceAction,
} from "@/app/finance-actions";
import { DirectoryDrawer } from "@/components/DirectoryDrawer";
import { daysUntil } from "@/lib/finance";
import {
  ACCOUNT_GROUP_LABEL,
  INVOICE_STATUS_LABEL,
  type AccountGroup,
  type AccountRow,
  type DutchInsurer,
  type SaScheme,
} from "@/lib/finance-types";
import { HOUSE_SHORT, personDisplayName } from "@/lib/labels";

function days(date: string) {
  return daysUntil(date);
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function urgencyClass(nextDate: string) {
  const d = days(nextDate);
  if (d === null) return "text-muted";
  if (d < 0) return "text-terracotta";
  if (d <= 7) return "text-terracotta";
  if (d <= 14) return "text-sage-deep";
  return "text-muted";
}

function urgencyLabel(nextDate: string) {
  const d = days(nextDate);
  if (d === null) return "No date";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d <= 7) return `In ${d}d`;
  if (d <= 14) return `In ${d}d`;
  return `In ${d}d`;
}

const GROUPS: Array<AccountGroup | "all"> = [
  "all",
  "new_admissions",
  "phase_1",
  "phase_2",
  "phase_3",
  "discharged",
];

export function AccountsBoard({
  rows,
  renewals,
  group,
  counts,
  dutchInsurers,
  saSchemes,
}: {
  rows: AccountRow[];
  renewals: AccountRow[];
  group: AccountGroup | "all";
  counts: Record<AccountGroup | "all", number>;
  dutchInsurers: DutchInsurer[];
  saSchemes: SaScheme[];
}) {
  const nextPath = group === "all" ? "/accounts" : `/accounts?group=${group}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Accounts</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Billing board for Manor and Lodge. Raise Sage invoice queues a request for the Sage bot — Reach
            never posts the ledger. Undo-friendly status flips.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DirectoryDrawer title="NL insurer directory" triggerLabel="NL insurers">
            <ul className="space-y-4">
              {dutchInsurers.map((insurer) => (
                <li key={insurer.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium">{insurer.name}</p>
                  <p className="mt-1 text-sm text-muted">{insurer.submission_method}</p>
                  <p className="mt-1 text-sm">{insurer.submission_email || "—"}</p>
                  <p className="mt-2 text-xs text-muted">
                    Turnaround ~{insurer.turnaround_days}d · {insurer.digid_notes || "No DigiD notes"}
                  </p>
                </li>
              ))}
            </ul>
          </DirectoryDrawer>
          <DirectoryDrawer title="SA scheme directory" triggerLabel="SA schemes">
            <ul className="space-y-4">
              {saSchemes.map((scheme) => (
                <li key={scheme.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium">{scheme.name}</p>
                  <p className="mt-1 text-sm">{scheme.contact_email || "—"}</p>
                  <p className="text-sm text-muted">{scheme.contact_phone || "—"}</p>
                  <p className="mt-2 text-xs text-muted">{scheme.notes || scheme.portal_url}</p>
                </li>
              ))}
            </ul>
          </DirectoryDrawer>
        </div>
      </div>

      {renewals.length > 0 ? (
        <section className="mt-8 rounded-3xl border border-terracotta/40 bg-paper p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-2xl text-sage-deep">Renewals</h2>
            <p className="text-sm text-muted">Next invoice within 14 days or overdue</p>
          </div>
          <ul className="mt-4 space-y-3">
            {renewals.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-linen/60 px-4 py-3"
              >
                <div>
                  <Link href={`/people/${row.person_id}`} className="font-medium hover:underline">
                    {personDisplayName(row)}
                  </Link>
                  <p className={`text-sm ${urgencyClass(row.next_invoice_date)}`}>
                    Next {row.next_invoice_date || "—"} · {urgencyLabel(row.next_invoice_date)} ·{" "}
                    {ACCOUNT_GROUP_LABEL[row.account_group]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={accountRenewalAction}>
                    <input type="hidden" name="personId" value={row.person_id} />
                    <input type="hidden" name="renewalAction" value="remind" />
                    <input type="hidden" name="next" value={nextPath} />
                    <button type="submit" className="min-h-10 rounded-full border border-line px-3 text-sm">
                      Remind
                    </button>
                  </form>
                  <form action={accountRenewalAction}>
                    <input type="hidden" name="personId" value={row.person_id} />
                    <input type="hidden" name="renewalAction" value="raise" />
                    <input type="hidden" name="next" value={nextPath} />
                    <button type="submit" className="min-h-10 rounded-full bg-sage px-3 text-sm text-paper">
                      Raise invoice
                    </button>
                  </form>
                  <form action={accountRenewalAction}>
                    <input type="hidden" name="personId" value={row.person_id} />
                    <input type="hidden" name="renewalAction" value="renewed" />
                    <input type="hidden" name="next" value={nextPath} />
                    <button type="submit" className="min-h-10 rounded-full border border-line px-3 text-sm">
                      Mark renewed
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-1">
        {GROUPS.map((key) => {
          const active = group === key;
          const href = key === "all" ? "/accounts" : `/accounts?group=${key}`;
          const label = key === "all" ? "All" : ACCOUNT_GROUP_LABEL[key];
          return (
            <Link
              key={key}
              href={href}
              className={`inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm ${
                active ? "bg-sage text-paper" : "border border-line hover:bg-sand/70"
              }`}
            >
              {label}
              <span className={`ml-2 text-xs ${active ? "text-paper/80" : "text-muted"}`}>
                {counts[key]}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Select rows for batch Raise Sage invoice.</p>
        <button
          type="submit"
          form="batch-raise-form"
          className="min-h-11 rounded-full bg-sage px-4 text-sm text-paper"
        >
          Raise Sage invoice (batch)
        </button>
      </div>

      <form id="batch-raise-form" action={batchRaiseSageInvoiceAction}>
        <input type="hidden" name="next" value={nextPath} />
      </form>

      <div className="grid gap-4">
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">
            No account cards in this group yet.
          </p>
        ) : null}
        {rows.map((row) => (
          <article key={row.id} className="rounded-3xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  form="batch-raise-form"
                  name="personIds"
                  value={row.person_id}
                  className="mt-2 h-4 w-4 accent-[var(--sage)]"
                  aria-label={`Select ${personDisplayName(row)}`}
                />
                <div>
                  <Link href={`/people/${row.person_id}`} className="serif text-2xl text-sage-deep hover:underline">
                    {personDisplayName(row)}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {row.house ? HOUSE_SHORT[row.house] : "Facility —"} ·{" "}
                    {ACCOUNT_GROUP_LABEL[row.account_group]}
                    {row.room_privacy === "shared" || row.room_privacy === "private"
                      ? ` · ${row.room_privacy === "shared" ? "Shared" : "Private"}`
                      : ""}
                    {row.transfer_extension_status && row.transfer_extension_status !== "none"
                      ? ` · ${row.transfer_extension_status.replace(/_/g, " ")}`
                      : ""}
                  </p>
                </div>
              </div>
              <form action={raiseSageInvoiceAction}>
                <input type="hidden" name="personId" value={row.person_id} />
                <input type="hidden" name="next" value={nextPath} />
                <button type="submit" className="min-h-11 rounded-full bg-sage px-4 text-sm text-paper">
                  Raise Sage invoice
                </button>
              </form>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">DOA / DOD</dt>
                <dd>
                  {row.admission_date || row.admitted_at.slice(0, 10) || "—"}
                  {row.planned_discharge_date ? ` → ${row.planned_discharge_date}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Rate</dt>
                <dd>
                  {money(row.rate_amount, row.rate_currency)} · {row.rate_currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Paid</dt>
                <dd>
                  {money(row.amount_paid, row.rate_currency)} / {money(row.total_amount, row.rate_currency)} (
                  {row.percent_paid}%)
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Invoice status</dt>
                <dd className={urgencyClass(row.next_invoice_date)}>
                  {INVOICE_STATUS_LABEL[row.invoice_status]}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">ARF</dt>
                <dd>
                  {row.arf_sent ? "Sent" : "Not sent"} · {row.arf_signed ? "Signed" : "Unsigned"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">ARP</dt>
                <dd>
                  {row.arp_name || "—"}
                  {row.arp_signed ? " · signed" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Last / next invoice</dt>
                <dd>
                  {row.last_invoice_date || "—"} /{" "}
                  <span className={urgencyClass(row.next_invoice_date)}>
                    {row.next_invoice_date || "—"}{" "}
                    {row.next_invoice_date ? `(${urgencyLabel(row.next_invoice_date)})` : ""}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Links</dt>
                <dd className="flex flex-wrap gap-2">
                  <Link href="/dutch-insurance" className="underline-offset-2 hover:underline">
                    Dutch
                  </Link>
                  <Link href="/sa-medical-aid" className="underline-offset-2 hover:underline">
                    SA aid
                  </Link>
                  <Link href="/visa" className="underline-offset-2 hover:underline">
                    Visa
                  </Link>
                  <Link href="/invoices" className="underline-offset-2 hover:underline">
                    Invoices
                  </Link>
                </dd>
              </div>
            </dl>
            {row.notes ? <p className="mt-3 text-sm text-muted">{row.notes}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
