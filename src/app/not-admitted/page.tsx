import { AppShell } from "@/components/AppShell";
import { HistoryBoard } from "@/components/HistoryBoard";
import { listNotAdmittedHistory } from "@/lib/history";
import { requireStaff } from "@/lib/page-helpers";

export default async function NotAdmittedPage() {
  const user = await requireStaff();
  return (
    <AppShell user={user} current="/not-admitted">
      <HistoryBoard
        title="Not admitted"
        lede="Enquiries that were archived or closed without ever reaching Admit or Resident. The reason is shown when it was recorded."
        people={listNotAdmittedHistory()}
        mode="not_admitted"
        empty="No enquiries have been archived without admission."
        exportHref="/export/not-admitted"
      />
    </AppShell>
  );
}
