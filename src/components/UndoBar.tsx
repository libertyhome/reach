import { undoAction } from "@/app/actions";
import { getAuditEvent } from "@/lib/audit";

export async function UndoBar({ eventId, notice }: { eventId?: string; notice?: string }) {
  if (!eventId && !notice) return null;
  const event = eventId ? getAuditEvent(eventId) : null;
  if (event && event.undone) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/30 bg-paper px-4 py-3">
      <p className="text-sm">
        {notice ?? (event ? event.summary : "Saved.")}
        {event ? <span className="text-muted"> · undo restores the previous card.</span> : null}
      </p>
      {event && !event.undone ? (
        <form action={undoAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <button type="submit" className="min-h-11 rounded-full bg-sage px-4 text-sm text-paper">
            Undo
          </button>
        </form>
      ) : null}
    </div>
  );
}
