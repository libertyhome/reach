import { AppShell } from "@/components/AppShell";
import { SaMedicalAidBoard } from "@/components/SaMedicalAidBoard";
import { listSaMedicalAidApps, listSaSchemes } from "@/lib/finance";
import { requireMoneyAccess } from "@/lib/page-helpers";

export default async function SaMedicalAidPage() {
  const user = await requireMoneyAccess();
  return (
    <AppShell user={user} current="/sa-medical-aid">
      <SaMedicalAidBoard apps={listSaMedicalAidApps()} schemes={listSaSchemes()} />
    </AppShell>
  );
}
