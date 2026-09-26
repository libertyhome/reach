import { AppShell } from "@/components/AppShell";
import { VisaBoard } from "@/components/VisaBoard";
import { listVisaApps } from "@/lib/finance";
import { requireMoneyAccess } from "@/lib/page-helpers";

export default async function VisaPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string }>;
}) {
  const user = await requireMoneyAccess();
  const params = await searchParams;
  const facilityRaw = params.facility ?? "all";
  const facility = facilityRaw === "manor" || facilityRaw === "lodge" ? facilityRaw : "all";
  const all = listVisaApps("all");
  const rows = listVisaApps(facility);
  const counts = {
    all: all.length,
    manor: all.filter((row) => row.facility === "manor").length,
    lodge: all.filter((row) => row.facility === "lodge").length,
  };

  return (
    <AppShell user={user} current="/visa">
      <VisaBoard rows={rows} facility={facility} counts={counts} />
    </AppShell>
  );
}
