import { undoAction } from "@/app/actions";
import { findUserById } from "@/lib/users";
import type { AuditEvent } from "@/lib/types";

function actorFirstName(actorId: string) {
  const user = findUserById(actorId);
  if (!user) return null;
  return user.name.trim().split(/\s+/)[0] || user.name;
}

function displaySummary(event: AuditEvent) {
  const actor = actorFirstName(event.actor_id);
  if (!actor) return event.summary;
  if (event.summary.includes(`— ${actor}`) || event.summary.includes(`– ${actor}`)) {
    return event.summary;
  }
  return `${event.summary} — ${actor}`;
}

export function AuditList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">No changes yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-2xl border border-line bg-linen px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm">{displaySummary(event)}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted">
                {event.action.replace("_", " ")} · {event.created_at.slice(0, 16).replace("T", " ")}
                {event.undone ? " · undone" : ""}
              </p>
            </div>
            {!event.undone && event.action !== "undo" && event.before_json !== "null" ? (
              <form action={undoAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className="min-h-10 rounded-full border border-line px-3 text-xs">
                  Undo
                </button>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
