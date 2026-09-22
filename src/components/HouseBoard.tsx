import Link from "next/link";
import { HOUSE_CAPACITY, HOUSE_LABEL, personDisplayName } from "@/lib/labels";
import type { House } from "@/lib/types";
import type { RoomCard } from "@/lib/rooms";

export function HouseBoardView({
  house,
  rooms,
}: {
  house: House;
  rooms: RoomCard[];
}) {
  const occupied = rooms.filter((room) => room.occupant).length;
  const capacity = HOUSE_CAPACITY[house];

  return (
    <>
      <div>
        <h1 className="serif text-4xl text-sage-deep">
          {house === "manor" ? "Manor (21)" : "Lodge (16)"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {HOUSE_LABEL[house]}. Occupancy {occupied}/{capacity}. Cards are rooms, not a spreadsheet.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <article
            key={room.id}
            className={`rounded-3xl border p-5 ${
              room.occupant ? "border-line bg-paper" : "border-dashed border-line bg-linen"
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-muted">Room</p>
            <p className="serif text-2xl text-sage-deep">{room.name}</p>
            {room.occupant ? (
              <Link href={`/people/${room.occupant.id}`} className="mt-3 block">
                <p className="font-medium">{personDisplayName(room.occupant)}</p>
                <p className="text-sm text-muted">
                  Resident
                  {room.occupant.room_privacy === "shared"
                    ? " · Shared"
                    : room.occupant.room_privacy === "private"
                      ? " · Private"
                      : ""}{" "}
                  · open commercial card
                </p>
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted">Vacant</p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
