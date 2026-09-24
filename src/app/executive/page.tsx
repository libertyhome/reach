import { AppShell } from "@/components/AppShell";
import { ExecutiveBoard } from "@/components/ExecutiveBoard";
import { buildExecutiveAnalytics, buildOccupancySnapshot, parseAnalyticsFilters } from "@/lib/executive";
import { requireExecutiveAccess } from "@/lib/page-helpers";
import { listPeople } from "@/lib/people";
import { listUsers } from "@/lib/users";

export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    facility?: string;
    phase?: string;
    leadSource?: string;
    referrer?: string;
    owner?: string;
  }>;
}) {
  const user = await requireExecutiveAccess();
  const params = await searchParams;
  const people = listPeople();
  const staff = listUsers();
  const filters = parseAnalyticsFilters(params, staff);
  const snapshot = buildOccupancySnapshot(people);
  const analytics = buildExecutiveAnalytics(people, staff, filters);

  return (
    <AppShell user={user} current="/executive">
      <ExecutiveBoard snapshot={snapshot} analytics={analytics} />
    </AppShell>
  );
}
