import Link from "next/link";
import { HOUSE_LABEL } from "@/lib/labels";
import type { HouseOccupancyView } from "@/lib/within-occupancy";

export function HouseBoardView({ board }: { board: HouseOccupancyView }) {
  const houseLabel = board.house === "manor" ? "Manor" : "Lodge";

  return (
    <>
      <div>
        <h1 className="serif text-4xl text-sage-deep">
          {houseLabel} ({board.capacity})
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {HOUSE_LABEL[board.house]}. {board.known ? `${board.occupied} of ${board.capacity} beds occupied.` : `${board.capacity} beds.`}{" "}
          Names come from Within. Manor and Lodge are separate.
        </p>
        {board.unreachable ? (
          <p className="mt-4 max-w-2xl rounded-2xl border border-terracotta/40 bg-sand px-4 py-3 text-sm">
            {board.known
              ? `Within is unreachable. Showing occupancy last synced ${board.syncedAtLabel}.`
              : "Within is unreachable. Occupancy has not synced yet, so no bed is shown as occupied."}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">Live from Within. Synced {board.syncedAtLabel}.</p>
        )}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {board.rooms.map((room) => (
          <article
            key={room.name}
            className={`rounded-3xl border p-5 ${
              room.occupied > 0 ? "border-line bg-paper" : "border-dashed border-line bg-linen"
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-muted">Room</p>
            <p className="serif text-2xl text-sage-deep">{room.name}</p>
            <p className="mt-1 text-sm text-muted">
              {room.occupied} of {room.capacity} {room.capacity === 1 ? "bed" : "beds"}
            </p>
            <ul className="mt-3 space-y-2">
              {room.beds.map((bed, index) => (
                <li key={`${room.name}-${index}`} className="rounded-2xl bg-linen px-3 py-2">
                  {bed.status === "occupied" ? (
                    bed.reachPersonId ? (
                      <Link href={`/people/${bed.reachPersonId}`} className="block">
                        <p className="font-medium">{bed.patientName}</p>
                        <p className="text-sm text-muted">
                          {bed.admissionDate ? `Admitted ${bed.admissionDate}` : "Admitted"} · open commercial card
                        </p>
                      </Link>
                    ) : (
                      <>
                        <p className="font-medium">{bed.patientName}</p>
                        <p className="text-sm text-muted">
                          {bed.admissionDate ? `Admitted ${bed.admissionDate}` : "In Within"}
                        </p>
                      </>
                    )
                  ) : (
                    <p className="text-sm text-muted">{bed.status === "vacant" ? "Vacant" : "Not synced"}</p>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
