import { AppShell } from "@/components/AppShell";
import { StageBoard } from "@/components/StageBoard";
import { UndoBar } from "@/components/UndoBar";
import { requireStaff } from "@/lib/page-helpers";
import { listPeopleByStage } from "@/lib/people";

export default async function AdmitPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string; focus?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  return (
    <AppShell user={user} current="/admit">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <StageBoard
        title="Admit"
        lede="Confirm into a vacant room. Treatment is the main path and can start with the Detox add-on (1–5 days) on the same admission. Short stay is detox-only or brief. The day count is sent to Within with the admission pack. Form 7, meds, ROI, and risk stay in Within."
        actionHref="/admit/ipad"
        actionLabel="iPad admission packs"
        people={listPeopleByStage("admit")}
        highlightId={params.focus}
        empty="No one is waiting to be admitted."
      />
    </AppShell>
  );
}
