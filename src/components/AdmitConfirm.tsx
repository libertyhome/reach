import { confirmAdmitAction } from "@/app/actions";
import { AdmissionTypeFields } from "@/components/AdmissionTypeFields";
import { HOUSE_SHORT } from "@/lib/labels";
import { checklistComplete } from "@/lib/pipeline";
import { houseBoard } from "@/lib/rooms";
import { HOUSES, type Person, type User } from "@/lib/types";

export function AdmitConfirm({ person, staff }: { person: Person; staff: User[] }) {
  const ready = checklistComplete(person);
  const preference = person.house_preference === "lodge" ? "lodge" : "manor";
  const preferredVacant =
    person.preferred_room_id &&
    HOUSES.some((house) =>
      houseBoard(house).some((room) => room.id === person.preferred_room_id && !room.occupant),
    )
      ? person.preferred_room_id
      : "";

  return (
    <form action={confirmAdmitAction} className="space-y-4 rounded-3xl border border-sage/40 bg-paper p-6">
      <input type="hidden" name="id" value={person.id} />
      <h2 className="serif text-2xl text-sage-deep">Confirm admit</h2>
      <p className="text-sm text-muted">
        Confirm the room assignment here (preferences above are drafts only). Places them on a house board and opens a
        Within admission pack. Form 7, meds, ROI, and risk stay in Within.
      </p>
      {!ready ? (
        <p className="rounded-2xl bg-sand px-4 py-3 text-sm">
          Finish the commercial checklist first. This button stays off until every box is ticked.
        </p>
      ) : null}
      <label className="block">
        <span className="text-sm font-medium">Confirm vacant room</span>
        <select
          name="room_id"
          required
          defaultValue={preferredVacant}
          disabled={!ready}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
        >
          <option value="" disabled>
            Choose a vacant room
          </option>
          {HOUSES.flatMap((house) =>
            houseBoard(house)
              .filter((room) => !room.occupant)
              .map((room) => (
                <option key={room.id} value={room.id}>
                  {HOUSE_SHORT[house]} · {room.name}
                  {room.id === person.preferred_room_id ? " — preferred" : ""}
                  {house === preference && room.id !== person.preferred_room_id ? " — preferred house" : ""}
                </option>
              )),
          )}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Manor phase</span>
        <select
          name="manor_phase"
          defaultValue={person.manor_phase || "1"}
          disabled={!ready}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
        >
          <option value="1">Phase 1</option>
          <option value="2">Phase 2</option>
        </select>
        <span className="mt-1 block text-xs text-muted">
          Required for Manor. This is the treatment phase on this admission, including after detox — no second admit.
          Lodge is always Phase 3 (sober living); this picker is ignored for Lodge rooms.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Assign counsellor</span>
        <select
          name="counsellor_user_id"
          defaultValue={person.counsellor_user_id}
          disabled={!ready}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
        >
          <option value="">Assign later</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} · {member.role}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Admission date</span>
          <input
            name="admission_date"
            type="date"
            defaultValue={person.admission_date || person.expected_arrival}
            disabled={!ready}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Planned discharge</span>
          <input
            name="planned_discharge_date"
            type="date"
            defaultValue={person.planned_discharge_date}
            disabled={!ready}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3 disabled:opacity-60"
          />
        </label>
      </div>
      <AdmissionTypeFields disabled={!ready} />
      <button
        type="submit"
        disabled={!ready}
        className="min-h-12 w-full rounded-full bg-sage text-paper disabled:opacity-50"
      >
        Confirm admit and open Within pack
      </button>
    </form>
  );
}
