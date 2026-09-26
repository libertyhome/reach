import { AppShell } from "@/components/AppShell";
import { StageBoard } from "@/components/StageBoard";
import { UndoBar } from "@/components/UndoBar";
import { requireStaff } from "@/lib/page-helpers";
import { listPeopleByStage } from "@/lib/people";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string; focus?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  const people = listPeopleByStage("enquiry");

  return (
    <AppShell user={user} current="/enquiries">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <StageBoard
        title="Enquiries"
        lede="New commercial enquiries. Cards, not a grid. Lead source is a label — it never moves or archives a card."
        people={people}
        highlightId={params.focus}
        empty="No open enquiries. Log one when the phone or website comes in."
        actionHref="/enquiries/new"
        actionLabel="New enquiry"
        exportHref="/export/enquiries"
      />
    </AppShell>
  );
}
