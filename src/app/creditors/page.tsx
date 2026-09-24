import { AppShell } from "@/components/AppShell";
import { CreditorsBoard } from "@/components/CreditorsBoard";
import { getCreditor, listCreditors, readProfitAndLossStrip } from "@/lib/creditors";
import { requireCreditorsAccess } from "@/lib/page-helpers";

export default async function CreditorsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  const user = await requireCreditorsAccess();
  const params = await searchParams;
  const editing = params.edit ? getCreditor(params.edit) : null;

  return (
    <AppShell user={user} current="/creditors">
      <CreditorsBoard
        creditors={listCreditors()}
        editing={editing}
        pnl={readProfitAndLossStrip()}
        notice={params.notice}
      />
    </AppShell>
  );
}
