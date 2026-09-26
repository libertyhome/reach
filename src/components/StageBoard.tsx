import Link from "next/link";
import { ExportExcelLink } from "@/components/ExportExcelLink";
import { listSourceBadges } from "@/lib/lead-forms";
import type { Person } from "@/lib/types";
import { PersonCard } from "./PersonCard";

export function StageBoard({
  title,
  lede,
  people,
  highlightId,
  empty,
  actionHref,
  actionLabel,
  exportHref,
}: {
  title: string;
  lede: string;
  people: Person[];
  highlightId?: string;
  empty: string;
  actionHref?: string;
  actionLabel?: string;
  exportHref?: string;
}) {
  const badges = listSourceBadges(people.map((person) => person.id));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">{title}</h1>
          <p className="mt-2 max-w-2xl text-muted">{lede}</p>
        </div>
        {exportHref || (actionHref && actionLabel) ? (
          <div className="flex flex-wrap gap-2">
            {exportHref ? <ExportExcelLink href={exportHref} /> : null}
            {actionHref && actionLabel ? (
              <Link href={actionHref} className="min-h-12 rounded-full bg-sage px-5 py-3 text-paper">
                {actionLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {people.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted md:col-span-2">{empty}</p>
        ) : null}
        {people.map((person) => (
          <PersonCard key={person.id} person={person} highlight={person.id === highlightId} source={badges.get(person.id) ?? null} />
        ))}
      </div>
    </>
  );
}
