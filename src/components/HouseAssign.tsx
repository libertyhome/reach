import { assignHouseAction } from "@/app/actions";
import { HOUSE_SHORT } from "@/lib/labels";
import { houseBoard } from "@/lib/rooms";
import { HOUSES, type Person } from "@/lib/types";

export function HouseAssign({ person }: { person: Person }) {
  const isResident = person.stage === "resident";

  if (!isResident) {
    return (
      <form action={assignHouseAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
        <input type="hidden" name="id" value={person.id} />
        <input type="hidden" name="mode" value="preference" />
        <h2 className="serif text-2xl text-sage-deep">Room preference</h2>
        <p className="text-sm text-muted">
          Draft preference anytime. Confirmed room assignment happens on Admit — this does not place them on a house
          board yet.
        </p>
        <label className="block">
          <span className="text-sm font-medium">Preferred house</span>
          <select
            name="house_preference"
            defaultValue={person.house_preference}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          >
            <option value="">Not set</option>
            <option value="either">Either</option>
            {HOUSES.map((house) => (
              <option key={house} value={house}>
                {HOUSE_SHORT[house]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Preferred room</span>
          <select
            name="preferred_room_id"
            defaultValue={person.preferred_room_id}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          >
            <option value="">No preferred room yet</option>
            {HOUSES.flatMap((house) =>
              houseBoard(house).map((room) => (
                <option key={room.id} value={room.id}>
                  {HOUSE_SHORT[house]} · {room.name}
                  {room.occupants.length ? ` (${room.occupants.length}/${room.capacity || 1})` : ""}
                </option>
              )),
            )}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Shared / Private</span>
          <select
            name="room_privacy"
            defaultValue={person.room_privacy || ""}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          >
            <option value="">Not set</option>
            <option value="shared">Shared</option>
            <option value="private">Private</option>
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-full border border-line px-5">
          Save preference
        </button>
      </form>
    );
  }

  return (
    <form action={assignHouseAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="id" value={person.id} />
      <input type="hidden" name="mode" value="confirmed" />
      <h2 className="serif text-2xl text-sage-deep">House and room</h2>
      <p className="text-sm text-muted">
        Confirmed assignment for a resident. Undoable. A room holds as many people as it has beds. Manor and Lodge stay
        separate. Who is in each bed on the house board comes from Within.
      </p>
      <label className="block">
        <span className="text-sm font-medium">House</span>
        <select name="house" defaultValue={person.house} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          <option value="">Not assigned</option>
          {HOUSES.map((house) => (
            <option key={house} value={house}>
              {HOUSE_SHORT[house]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Room</span>
        <select name="room_id" defaultValue={person.room_id} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          <option value="">No room yet</option>
          {HOUSES.flatMap((house) =>
            houseBoard(house).map((room) => {
              const others = room.occupants.filter((occupant) => occupant.id !== person.id).length;
              const full = others >= (room.capacity || 1);
              return (
                <option key={room.id} value={room.id} disabled={full}>
                  {HOUSE_SHORT[house]} · {room.name}
                  {full ? " (full)" : room.occupants.length ? ` (${room.occupants.length}/${room.capacity || 1})` : ""}
                </option>
              );
            }),
          )}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Shared / Private</span>
        <select
          name="room_privacy"
          defaultValue={person.room_privacy || ""}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        >
          <option value="">Not set</option>
          <option value="shared">Shared</option>
          <option value="private">Private</option>
        </select>
      </label>
      <button type="submit" className="min-h-12 rounded-full border border-line px-5">
        Save assignment
      </button>
    </form>
  );
}
