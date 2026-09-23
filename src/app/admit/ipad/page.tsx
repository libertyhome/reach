import type { Metadata } from "next";
import Link from "next/link";
import { AdmissionPack } from "@/components/AdmissionPack";
import { AppShell } from "@/components/AppShell";
import { UndoBar } from "@/components/UndoBar";
import { checklistComplete } from "@/lib/pipeline";
import { HOUSE_SHORT, personDisplayName } from "@/lib/labels";
import { requireStaff } from "@/lib/page-helpers";
import { getPerson, listAdmitQueue, listResidentsForPack } from "@/lib/people";
import type { House } from "@/lib/types";

export const metadata: Metadata = {
  title: "Admit — Reach",
  appleWebApp: {
    capable: true,
    title: "Admit",
    statusBarStyle: "default",
  },
};

function houseParam(value: string | undefined): House | undefined {
  if (value === "manor" || value === "lodge") return value;
  return undefined;
}

export default async function IpadAdmitPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string; focus?: string; house?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  const house = houseParam(params.house);
  const waiting = listAdmitQueue().filter((person) => {
    if (!house) return true;
    return person.house_preference === house || person.house_preference === "either" || person.house_preference === "";
  });
  const packs = listResidentsForPack(house);
  const focus = params.focus ? getPerson(params.focus) : null;

  return (
    <AppShell user={user} current="/admit">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Admit</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Floor iPad hub. Confirm a ready client — Treatment, with detox first if they need it, or Short stay — then open the Within admission pack. One home-screen icon covers every form.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admit/ipad?house=manor"
            className={`inline-flex min-h-12 items-center rounded-full px-4 ${house === "manor" ? "bg-sage text-paper" : "border border-line"}`}
          >
            Manor
          </Link>
          <Link
            href="/admit/ipad?house=lodge"
            className={`inline-flex min-h-12 items-center rounded-full px-4 ${house === "lodge" ? "bg-sage text-paper" : "border border-line"}`}
          >
            Lodge
          </Link>
        </div>
      </div>

      {focus && focus.stage === "resident" ? (
        <div className="mt-6">
          <AdmissionPack person={focus} />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="serif text-2xl text-sage-deep">Ready to admit</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {waiting.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line p-6 text-muted md:col-span-2">No one is waiting to be admitted.</p>
          ) : null}
          {waiting.map((person) => (
            <Link
              key={person.id}
              href={`/people/${person.id}`}
              className={`block rounded-3xl border bg-paper p-5 ${person.id === params.focus ? "border-sage" : "border-line"}`}
            >
              <p className="serif text-2xl text-sage-deep">{personDisplayName(person)}</p>
              <p className="mt-2 text-sm text-muted">
                {checklistComplete(person) ? "Checklist complete — confirm into a room." : "Checklist still open."}
                {person.house_preference === "manor" || person.house_preference === "lodge"
                  ? ` Preference ${HOUSE_SHORT[person.house_preference]}.`
                  : person.house_preference === "either"
                    ? " Preference either house."
                    : ""}
              </p>
              <span className="mt-4 inline-flex min-h-12 items-center rounded-full bg-sage px-4 text-paper">Open to confirm</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="serif text-2xl text-sage-deep">Admission packs</h2>
        <p className="mt-2 text-sm text-muted">Residents already on a house. Open a pack to resume Within forms.</p>
        <div className="mt-4 grid gap-4">
          {packs.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line p-6 text-muted">No admission packs on this house.</p>
          ) : null}
          {packs.map((person) => (
            <div key={person.id} id={person.id} className={person.id === params.focus ? "rounded-3xl ring-2 ring-sage" : ""}>
              <AdmissionPack person={person} />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
