import { AppShell } from "@/components/AppShell";
import { FinanceUndoBar } from "@/components/FinanceUndoBar";
import { InvoicesBoard } from "@/components/InvoicesBoard";
import { listInvoiceRequests, listPaymentInvoices } from "@/lib/finance";
import { requireStaff } from "@/lib/page-helpers";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;

  return (
    <AppShell user={user} current="/invoices">
      <FinanceUndoBar eventId={params.undo} notice={params.notice} next="/invoices" />
      <InvoicesBoard invoices={listPaymentInvoices()} recentRequests={listInvoiceRequests(12)} />
    </AppShell>
  );
}
