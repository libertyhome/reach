import Link from "next/link";
import { daysUntil } from "@/lib/finance";
import type { VisaRow } from "@/lib/finance-types";
import { HOUSE_SHORT, personDisplayName } from "@/lib/labels";

function urgency(days: number | null) {
  if (days === null) return { label: "—", className: "text-muted" };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, className: "text-terracotta font-medium" };
  if (days <= 30) return { label: `${days}d left`, className: "text-terracotta font-medium" };
  if (days <= 60) return { label: `${days}d left`, className: "text-sage-deep" };
  return { label: `${days}d left`, className: "text-muted" };
}

export function VisaBoard({
  rows,
  facility,
  counts,
}: {
  rows: VisaRow[];
  facility: "all" | "manor" | "lodge";
  counts: { all: number; manor: number; lodge: number };
}) {
  const filters: Array<"all" | "manor" | "lodge"> = ["all", "manor", "lodge"];

  return (
    <>
      <div>
        <h1 className="serif text-4xl text-sage-deep">Visa</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Passport and visa tracker for Manor and Lodge. Urgency flags under 30 / 60 days.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-1">
        {filters.map((key) => {
          const active = facility === key;
          const href = key === "all" ? "/visa" : `/visa?facility=${key}`;
          const label = key === "all" ? "All" : HOUSE_SHORT[key];
          return (
            <Link
              key={key}
              href={href}
              className={`inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm ${
                active ? "bg-sage text-paper" : "border border-line hover:bg-sand/70"
              }`}
            >
              {label}
              <span className={`ml-2 text-xs ${active ? "text-paper/80" : "text-muted"}`}>{counts[key]}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4">
        {rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">No visa cards in this filter.</p>
        ) : null}
        {rows.map((row) => {
          const visaDays = daysUntil(row.visa_expiry);
          const passportDays = daysUntil(row.passport_expiry);
          const visaU = urgency(visaDays);
          const passportU = urgency(passportDays);
          return (
            <article key={row.id} className="rounded-3xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/people/${row.person_id}`} className="serif text-2xl text-sage-deep hover:underline">
                    {personDisplayName(row)}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {row.facility ? HOUSE_SHORT[row.facility] : "—"} ·{" "}
                    {row.visa_type === "medical" ? "Medical visa" : "Tourist visa"}
                  </p>
                </div>
                <p className={`text-sm ${visaU.className}`}>Visa {visaU.label}</p>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">Passport expiry</dt>
                  <dd>
                    {row.passport_expiry || "—"}{" "}
                    <span className={passportU.className}>({passportU.label})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">Visa expiry</dt>
                  <dd>
                    {row.visa_expiry || "—"} <span className={visaU.className}>({visaU.label})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">VFS</dt>
                  <dd>{row.vfs_status || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted">Extension</dt>
                  <dd>{row.extension_status || "—"}</dd>
                </div>
              </dl>
              {row.notes ? <p className="mt-3 text-sm text-muted">{row.notes}</p> : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
