import { PACK_BUTTONS, facilityLine, withinPackUrl } from "@/lib/handoff";
import { HOUSE_SHORT, admissionSummary, personDisplayName } from "@/lib/labels";
import { getRoom } from "@/lib/rooms";
import type { Person } from "@/lib/types";

export function AdmissionPack({ person }: { person: Person }) {
  const overview = withinPackUrl(person);
  const room = person.room_id ? getRoom(person.room_id) : null;
  if (!overview || !person.house) return null;
  const kind = admissionSummary(person) || "Treatment";

  return (
    <section className="rounded-3xl border border-sage/40 bg-paper p-6">
      <h2 className="serif text-2xl text-sage-deep">iPad admission pack</h2>
      <p className="mt-2 text-sm text-muted">
        {personDisplayName(person)} · {HOUSE_SHORT[person.house]}
        {room ? ` · ${room.name}` : ""} · {kind}. {facilityLine(person)}. Buttons open Within. Clinical detail is not stored here.
      </p>
      <a
        href={overview}
        className="mt-4 flex min-h-14 items-center justify-center rounded-full bg-sage px-5 text-center text-paper"
      >
        Open pack checklist in Within
      </a>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PACK_BUTTONS.map((button) => {
          const href = withinPackUrl(person, button.slug);
          if (!href) return null;
          return (
            <a
              key={button.slug}
              href={href}
              className="flex min-h-16 flex-col justify-center rounded-2xl border border-line bg-linen px-4 py-3"
            >
              <span className="text-lg font-medium text-sage-deep">{button.label}</span>
              <span className="text-sm text-muted">{button.hint}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
