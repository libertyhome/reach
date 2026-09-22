import { AppShell } from "@/components/AppShell";
import { HouseBoardView } from "@/components/HouseBoard";
import { UndoBar } from "@/components/UndoBar";
import { requireStaff } from "@/lib/page-helpers";
import { houseBoard } from "@/lib/rooms";

export default async function ManorPage({
  searchParams,
}: {
  searchParams: Promise<{ undo?: string; notice?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  return (
    <AppShell user={user} current="/manor">
      <UndoBar eventId={params.undo} notice={params.notice} />
      <HouseBoardView house="manor" rooms={houseBoard("manor")} />
    </AppShell>
  );
}
