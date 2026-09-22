import { AppShell } from "@/components/AppShell";
import { DutchInsuranceBoard } from "@/components/DutchInsuranceBoard";
import { listDutchInsuranceApps, listDutchInsurers } from "@/lib/finance";
import { requireStaff } from "@/lib/page-helpers";

export default async function DutchInsurancePage() {
  const user = await requireStaff();
  return (
    <AppShell user={user} current="/dutch-insurance">
      <DutchInsuranceBoard apps={listDutchInsuranceApps()} insurers={listDutchInsurers()} />
    </AppShell>
  );
}
