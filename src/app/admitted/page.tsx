import { AppShell } from "@/components/AppShell";
import { HistoryBoard } from "@/components/HistoryBoard";
import { listAdmittedHistory } from "@/lib/history";
import { requireStaff } from "@/lib/page-helpers";

export default async function AdmittedPage() {
  const user = await requireStaff();
  return (
    <AppShell user={user} current="/admitted">
      <HistoryBoard
        title="Admitted"
        lede="Anyone who reached Admit or became a resident, including people who were later discharged or archived. Open pipeline cards that never got that far stay on their stage."
        people={listAdmittedHistory()}
        mode="admitted"
        empty="No one has reached Admit or become a resident yet."
        exportHref="/export/admitted"
      />
    </AppShell>
  );
}
