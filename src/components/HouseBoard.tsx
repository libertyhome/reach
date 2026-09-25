import Link from "next/link";
import { HOUSE_LABEL } from "@/lib/labels";
import { unassignedNotice, type HouseOccupancyView } from "@/lib/within-occupancy";

export function HouseBoardView({ board }: { board: HouseOccupancyView }) {
  const houseLabel = board.house === "manor" ? "Manor" : "Lodge";

  return (
    <>
      <div>
        <h1 className="serif text-4xl text-sage-deep">
          {houseLabel} ({board.capacity})
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {HOUSE_LABEL[board.house]}.{" "}
          {board.known
            ? `${board.occupied} occupied · ${board.available} of ${board.capacity} beds available.`
            : "Within is unavailable."}{" "}
          Names come from Within. Manor and Lodge are separate.
        </p>
        {board.unreachable ? (
          <p className="mt-4 max-w-2xl rounded-2xl border border-terracotta/40 bg-sand px-4 py-3 text-sm">
            {board.known
              ? `Within is unreachable. Last synced ${board.syncedAtLabel}.`
              : "Within is unavailable."}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">Live from Within. Synced {board.syncedAtLabel}.</p>
        )}
        {board.unassignedCount > 0 ? (
          <div className="mt-4 max-w-2xl rounded-2xl border border-line bg-sand px-4 py-3 text-sm">
            <p className="font-medium">{unassignedNotice(board.unassignedCount)}</p>
            {board.unassigned.some((person) => person.patientName) ? (
              <ul className="mt-2 space-y-1">
                {board.unassigned.map((person, index) =>
                  person.patientName ? (
                    <li key={person.clientId || `${person.patientName}-${index}`}>
                      {person.reachPersonId ? (
                        <Link href={`/people/${person.reachPersonId}`} className="underline-offset-2 hover:underline">
                          {person.patientName}
                        </Link>
                      ) : (
                        person.patientName
                      )}
                      {person.admissionDate ? <span className="text-muted"> · admitted {person.admissionDate}</span> : null}
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>
        ) : null}
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
                <li key={bed.id || `${room.name}-${index}`} className="rounded-2xl bg-linen px-3 py-2">
                  {bed.label ? <p className="text-xs uppercase tracking-wider text-muted">{bed.label}</p> : null}
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
                    <p className="text-sm text-muted">{bed.status === "vacant" ? "Vacant" : "Unavailable"}</p>
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
