import Link from "next/link";
import { notFound } from "next/navigation";
import { AdmissionPack } from "@/components/AdmissionPack";
import { AdmitConfirm } from "@/components/AdmitConfirm";
import { AppShell } from "@/components/AppShell";
import { AuditList } from "@/components/AuditList";
import { ChecklistForm } from "@/components/ChecklistForm";
import { DocumentPanel } from "@/components/DocumentPanel";
import { HouseAssign } from "@/components/HouseAssign";
import { LeadSourceForm } from "@/components/LeadSourceForm";
import { PersonEditor } from "@/components/PersonEditor";
import { SendToWithin } from "@/components/SendToWithin";
import { StageMove } from "@/components/StageMove";
import { TransferExtensionForm } from "@/components/TransferExtensionForm";
import { UndoBar } from "@/components/UndoBar";
import { listAudit } from "@/lib/audit";
import { listDocuments } from "@/lib/documents";
import { HOUSE_SHORT, STAGE_LABEL, STAGE_NAV, admissionSummary, personDisplayName } from "@/lib/labels";
import { programPhaseFor } from "@/lib/occupancy";
import { requireStaff } from "@/lib/page-helpers";
import { getPerson } from "@/lib/people";
import { getRoom } from "@/lib/rooms";
import { listUsers } from "@/lib/users";

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ undo?: string; notice?: string; error?: string; confirm?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const query = await searchParams;
  const person = getPerson(id);
  if (!person) notFound();
  const room = person.room_id ? getRoom(person.room_id) : null;
  const preferred = person.preferred_room_id ? getRoom(person.preferred_room_id) : null;
  const staff = listUsers();
  const phase = programPhaseFor(person);
  const assignee = person.assigned_to_user_id
    ? staff.find((member) => member.id === person.assigned_to_user_id)
    : null;
  const current =
    STAGE_NAV.find((item) => item.stage === person.stage)?.href ??
    (person.house === "lodge" ? "/lodge" : person.house === "manor" ? "/manor" : "/enquiries");

  return (
    <AppShell user={user} current={current}>
      <UndoBar eventId={query.undo} notice={query.notice} />
      {query.error ? (
        <p className="mb-6 rounded-2xl border border-terracotta/40 bg-paper px-4 py-3 text-sm text-terracotta">
          {query.error}
        </p>
      ) : null}

      <p className="text-sm text-muted">
        <Link href={current} className="underline-offset-2 hover:underline">
          Back
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="serif text-4xl text-sage-deep">{personDisplayName(person)}</h1>
          <p className="mt-2 text-muted">
            {STAGE_LABEL[person.stage]}
            {person.house ? ` · ${HOUSE_SHORT[person.house]}` : ""}
            {room ? ` · ${room.name}` : ""}
            {phase ? ` · Phase ${phase}` : ""}
            {person.room_privacy === "shared" || person.room_privacy === "private"
              ? ` · ${person.room_privacy === "shared" ? "Shared" : "Private"}`
              : ""}
            {assignee ? ` · ${assignee.name.split(/\s+/)[0]}` : ""}
            {admissionSummary(person) ? ` · ${admissionSummary(person)}` : ""}
          </p>
          {person.stage !== "resident" && preferred ? (
            <p className="mt-1 text-sm text-muted">
              Preferred {HOUSE_SHORT[preferred.house]} · {preferred.name} (confirm on Admit)
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {person.within_handoff_status !== "none" ? (
            <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-wider">
              Within admission pack
            </span>
          ) : null}
          {person.within_waiting_status === "awaiting_admission" ? (
            <span className="rounded-full bg-sage px-3 py-1 text-xs uppercase tracking-wider text-paper">
              Awaiting admission
            </span>
          ) : null}
          {person.within_waiting_status === "already_admitted" ? (
            <span className="rounded-full bg-terracotta px-3 py-1 text-xs uppercase tracking-wider text-paper">
              Already admitted in Within
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <PersonEditor person={person} staff={staff} />
          <DocumentPanel personId={person.id} documents={listDocuments(person.id)} />
        </div>
        <div className="space-y-6">
          <LeadSourceForm person={person} />
          <StageMove person={person} />
          <ChecklistForm person={person} />
          <TransferExtensionForm person={person} />
          {person.stage === "admit" || person.within_waiting_status ? (
            <SendToWithin person={person} user={user} confirm={query.confirm === "within"} />
          ) : null}
          {person.stage === "resident" ? <AdmissionPack person={person} /> : null}
          {person.stage !== "resident" ? <HouseAssign person={person} /> : null}
          {person.stage === "admit" ? <AdmitConfirm person={person} staff={staff} /> : null}
          {person.stage === "resident" ? <HouseAssign person={person} /> : null}
        </div>
      </div>

      <section className="mt-10 rounded-3xl border border-line bg-paper p-6">
        <h2 className="serif text-2xl text-sage-deep">History and undo</h2>
        <p className="mt-2 mb-4 text-sm text-muted">
          Every significant change stores before and after, including who made it. Undo puts the card back.
        </p>
        <AuditList events={listAudit(person.id)} />
      </section>
    </AppShell>
  );
}
