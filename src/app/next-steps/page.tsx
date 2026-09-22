import { AppShell } from "@/components/AppShell";
import { StageBoard } from "@/components/StageBoard";
import { UndoBar } from "@/components/UndoBar";
import { requireStaff } from "@/lib/page-helpers";
import { listPeopleByStage } from "@/lib/people";

export default async function NextStepsPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string; focus?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  return (
    <AppShell user={user} current="/next-steps">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <StageBoard
        title="Next Steps"
        lede="Assessment calls, documents, and family follow-up. Still commercial — no clinical notes here. On each card, Accounts ticks deposit / ARP signed / accounts approved; Admissions ticks funding confirmed after Accounts approved."
        people={listPeopleByStage("next_steps")}
        highlightId={params.focus}
        empty="Nothing in Next Steps. Move a card from Enquiries when a conversation is booked."
      />
    </AppShell>
  );
}
