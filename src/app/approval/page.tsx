import { AppShell } from "@/components/AppShell";
import { StageBoard } from "@/components/StageBoard";
import { UndoBar } from "@/components/UndoBar";
import { requireStaff } from "@/lib/page-helpers";
import { listPeopleByStage } from "@/lib/people";

export default async function ApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string; focus?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  return (
    <AppShell user={user} current="/approval">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <StageBoard
        title="Account and Clinical Approval"
        lede="Funding and the clinical-approval gate. Tick boxes only — the clinical record is opened in Within after admit."
        people={listPeopleByStage("approval")}
        highlightId={params.focus}
        empty="No cards waiting on approval."
      />
    </AppShell>
  );
}
