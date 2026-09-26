import Link from "next/link";
import { ExportExcelLink } from "@/components/ExportExcelLink";
import type { InvoiceRequest, PaymentInvoiceRow } from "@/lib/finance-types";
import { HOUSE_SHORT } from "@/lib/labels";

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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending (Sage)",
  sent: "Sent",
  due: "Due",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function InvoicesBoard({
  invoices,
  recentRequests,
}: {
  invoices: PaymentInvoiceRow[];
  recentRequests: InvoiceRequest[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Invoices</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Payments board. Raise Sage invoice from Accounts lands here as pending — Sage bot owns ledger posting.
          </p>
        </div>
        <ExportExcelLink href="/export/invoices" />
      </div>

      {recentRequests.length > 0 ? (
        <section className="mt-8 rounded-3xl border border-sage/30 bg-paper p-5">
          <h2 className="serif text-2xl text-sage-deep">Recent Sage raise requests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {recentRequests.slice(0, 8).map((req) => (
              <li key={req.id} className="flex flex-wrap justify-between gap-2 border-b border-line/60 py-2 last:border-0">
                <span>
                  {req.client_name} · {req.status} · {money(req.amount_hint, req.currency)}
                </span>
                <span className="text-muted">{req.requested_at.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-4">
        {invoices.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">No invoices yet.</p>
        ) : null}
        {invoices.map((inv) => (
          <article key={inv.id} className="rounded-3xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="serif text-2xl text-sage-deep">{inv.invoice_number}</p>
                <p className="mt-1 text-sm text-muted">
                  {inv.person_id ? (
                    <Link href={`/people/${inv.person_id}`} className="hover:underline">
                      {inv.client_name || "Client"}
                    </Link>
                  ) : (
                    inv.client_name || "—"
                  )}
                  {inv.facility && (inv.facility === "manor" || inv.facility === "lodge")
                    ? ` · ${HOUSE_SHORT[inv.facility]}`
                    : ""}
                  {inv.insurance_ref ? ` · ${inv.insurance_ref}` : ""}
                </p>
              </div>
              <p className="text-sm font-medium">{STATUS_LABEL[inv.status] ?? inv.status}</p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Amount</dt>
                <dd>
                  {money(inv.amount, inv.currency)} · {inv.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Sent</dt>
                <dd>{inv.sent_date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Due</dt>
                <dd>{inv.due_date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Paid</dt>
                <dd>{inv.paid_date || "—"}</dd>
              </div>
            </dl>
            {inv.notes ? <p className="mt-3 text-sm text-muted">{inv.notes}</p> : null}
            {inv.source_request_id ? (
              <p className="mt-2 text-xs text-muted">From Sage request {inv.source_request_id}</p>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
