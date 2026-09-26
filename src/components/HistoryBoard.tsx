import Link from "next/link";
import { ExportExcelLink } from "@/components/ExportExcelLink";
import { closedOn } from "@/lib/history";
import {
  HOUSE_SHORT,
  STAGE_LABEL,
  leadSourceLabel,
  notConvertedReasonLabel,
  personDisplayName,
} from "@/lib/labels";
import type { Person } from "@/lib/types";

export function HistoryBoard({
  title,
  lede,
  people,
  mode,
  empty,
  exportHref,
}: {
  title: string;
  lede: string;
  people: Person[];
  mode: "admitted" | "not_admitted";
  empty: string;
  exportHref: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">{title}</h1>
          <p className="mt-2 max-w-2xl text-muted">{lede}</p>
        </div>
        <ExportExcelLink href={exportHref} />
      </div>
      <div className="mt-8 grid gap-4">
        {people.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">{empty}</p>
        ) : null}
        {people.map((person) => (
          <article key={person.id} className="rounded-3xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/people/${person.id}`} className="serif text-2xl text-sage-deep hover:underline">
                  {personDisplayName(person)}
                </Link>
                {mode === "admitted" ? (
                  <p className="mt-1 text-sm text-muted">
                    {STAGE_LABEL[person.stage]}
                    {person.house ? ` · ${HOUSE_SHORT[person.house]}` : ""}
                    {person.admission_date ? ` · admitted ${person.admission_date.slice(0, 10)}` : ""}
                    {person.archived_at ? ` · closed ${closedOn(person)}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">
                    {leadSourceLabel(person.lead_source)}
                    {person.enquiry_date ? ` · enquiry ${person.enquiry_date.slice(0, 10)}` : ""}
                    {` · closed ${closedOn(person)}`}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-wider">
                {mode === "admitted" ? "Admitted" : "Not admitted"}
              </span>
            </div>
            {mode === "admitted" ? (
              <p className="mt-3 text-sm">{leadSourceLabel(person.lead_source)}</p>
            ) : (
              <p className="mt-3 text-sm">
                {person.not_converted_reason
                  ? notConvertedReasonLabel(person.not_converted_reason)
                  : "Reason not recorded"}
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
