import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CreditorsBoard } from "@/components/CreditorsBoard";
import { loadCreditorView } from "@/lib/creditors";
import { requireCreditorsAccess } from "@/lib/page-helpers";

export default async function CreditorsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  const user = await requireCreditorsAccess();
  const desk = loadCreditorView(user);
  if (!desk.ok) redirect("/enquiries");
  const params = await searchParams;
  const editing = params.edit ? desk.creditors.find((row) => row.id === params.edit) ?? null : null;

  return (
    <AppShell user={user} current="/creditors">
      <CreditorsBoard creditors={desk.creditors} editing={editing} pnl={desk.pnl} notice={params.notice} />
    </AppShell>
  );
}
