import Link from "next/link";
import { DirectoryDrawer } from "@/components/DirectoryDrawer";
import {
  DUTCH_PROCESS_LABEL,
  type DutchInsuranceRow,
  type DutchInsurer,
} from "@/lib/finance-types";
import { HOUSE_SHORT, personDisplayName } from "@/lib/labels";

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

export function DutchInsuranceBoard({
  apps,
  insurers,
}: {
  apps: DutchInsuranceRow[];
  insurers: DutchInsurer[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Dutch Insurance</h1>
          <p className="mt-2 max-w-2xl text-muted">
            NL insurer applications (CZ, ASR, VGZ, …). Separate from SA medical aid by design. Demo seed only.
          </p>
        </div>
        <DirectoryDrawer title="Insurer directory" triggerLabel="Company directory">
          <ul className="space-y-4">
            {insurers.map((insurer) => (
              <li key={insurer.id} className="rounded-2xl border border-line p-4">
                <p className="font-medium">{insurer.name}</p>
                <p className="mt-1 text-sm text-muted">{insurer.submission_method}</p>
                <p className="mt-1 text-sm">{insurer.submission_email || "—"}</p>
                <p className="mt-2 text-xs text-muted">
                  ~{insurer.turnaround_days} days · {insurer.digid_notes || "—"}
                </p>
                {insurer.notes ? <p className="mt-2 text-sm text-muted">{insurer.notes}</p> : null}
              </li>
            ))}
          </ul>
        </DirectoryDrawer>
      </div>

      <div className="mt-8 grid gap-4">
        {apps.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">No Dutch applications yet.</p>
        ) : null}
        {apps.map((app) => (
          <article key={app.id} className="rounded-3xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/people/${app.person_id}`} className="serif text-2xl text-sage-deep hover:underline">
                  {personDisplayName(app)}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {app.insurer_name} · {app.house ? HOUSE_SHORT[app.house] : "—"} ·{" "}
                  {DUTCH_PROCESS_LABEL[app.process_stage]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {app.extension_flag ? (
                  <span className="rounded-full border border-line px-3 py-1">Extension</span>
                ) : null}
                {app.appeal_flag ? (
                  <span className="rounded-full border border-terracotta/40 px-3 py-1 text-terracotta">Appeal</span>
                ) : null}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Submitted</dt>
                <dd>{app.submitted_date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Approval amount</dt>
                <dd>
                  {app.approval_amount > 0 ? money(app.approval_amount, app.currency) : "Pending"} ·{" "}
                  {app.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted">Linked invoice</dt>
                <dd>
                  {app.linked_invoice_id ? (
                    <Link href="/invoices" className="hover:underline">
                      {app.linked_invoice_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {app.notes ? <p className="mt-3 text-sm text-muted">{app.notes}</p> : null}
          </article>
        ))}
      </div>
    </>
  );
}
