import { AccountsBoard } from "@/components/AccountsBoard";
import { AppShell } from "@/components/AppShell";
import { FinanceUndoBar } from "@/components/FinanceUndoBar";
import {
  countAccountGroups,
  listAccountRows,
  listDutchInsurers,
  listRenewals,
  listSaSchemes,
} from "@/lib/finance";
import { ACCOUNT_GROUPS, type AccountGroup } from "@/lib/finance-types";
import { requireMoneyAccess } from "@/lib/page-helpers";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; undo?: string; notice?: string }>;
}) {
  const user = await requireMoneyAccess();
  const params = await searchParams;
  const groupRaw = params.group ?? "all";
  const group: AccountGroup | "all" = ACCOUNT_GROUPS.includes(groupRaw as AccountGroup)
    ? (groupRaw as AccountGroup)
    : "all";
  const rows = listAccountRows(group);
  const renewals = listRenewals(14);
  const counts = countAccountGroups();
  const next = group === "all" ? "/accounts" : `/accounts?group=${group}`;

  return (
    <AppShell user={user} current="/accounts">
      <FinanceUndoBar eventId={params.undo} notice={params.notice} next={next} />
      <AccountsBoard
        rows={rows}
        renewals={renewals}
        group={group}
        counts={counts}
        dutchInsurers={listDutchInsurers()}
        saSchemes={listSaSchemes()}
      />
    </AppShell>
  );
}
