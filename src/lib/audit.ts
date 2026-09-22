import { getDb } from "./db";
import { newId } from "./passwords";
import { getPerson, replacePerson } from "./people";
import type { AuditAction, AuditEvent, Person } from "./types";

export function snapshotPerson(person: Person): Person {
  return { ...person };
}

export function writeAudit(input: {
  personId: string;
  action: AuditAction;
  summary: string;
  actorId: string;
  before: Person | null;
  after: Person | null;
  undoOf?: string;
  createdAt?: string;
}) {
  const event: AuditEvent = {
    id: newId("aud"),
    entity_type: "person",
    entity_id: input.personId,
    action: input.action,
    summary: input.summary,
    actor_id: input.actorId,
    before_json: JSON.stringify(input.before),
    after_json: JSON.stringify(input.after),
    undone: 0,
    undone_at: "",
    undo_of: input.undoOf ?? "",
    created_at: input.createdAt ?? new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO audit_events (
        id, entity_type, entity_id, action, summary, actor_id,
        before_json, after_json, undone, undone_at, undo_of, created_at
      ) VALUES (
        @id, @entity_type, @entity_id, @action, @summary, @actor_id,
        @before_json, @after_json, @undone, @undone_at, @undo_of, @created_at
      )`,
    )
    .run(event);
  return event;
}

export function getAuditEvent(id: string): AuditEvent | null {
  return (
    (getDb().prepare(`SELECT * FROM audit_events WHERE id = ?`).get(id) as AuditEvent | undefined) ?? null
  );
}

export function listAudit(personId: string, limit = 40): AuditEvent[] {
  return getDb()
    .prepare(`SELECT * FROM audit_events WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(personId, limit) as AuditEvent[];
}

export function latestUndoable(personId?: string): AuditEvent | null {
  if (personId) {
    return (
      (getDb()
        .prepare(
          `SELECT * FROM audit_events
           WHERE entity_id = ? AND undone = 0 AND action != 'undo' AND before_json != 'null'
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(personId) as AuditEvent | undefined) ?? null
    );
  }
  return (
    (getDb()
      .prepare(
        `SELECT * FROM audit_events
         WHERE undone = 0 AND action != 'undo' AND before_json != 'null'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get() as AuditEvent | undefined) ?? null
  );
}

export function undoEvent(eventId: string, actorId: string) {
  const event = getAuditEvent(eventId);
  if (!event) return { ok: false as const, error: "Nothing to undo." };
  if (event.undone) return { ok: false as const, error: "That change was already undone." };
  if (event.action === "undo") return { ok: false as const, error: "Cannot undo an undo record." };
  if (event.before_json === "null") return { ok: false as const, error: "That action has no prior state." };

  const before = JSON.parse(event.before_json) as Person;
  const current = getPerson(event.entity_id);
  if (!current) return { ok: false as const, error: "Person no longer exists." };

  const restored: Person = { ...before, updated_at: new Date().toISOString() };
  replacePerson(restored);

  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE audit_events SET undone = 1, undone_at = ? WHERE id = ?`)
    .run(now, event.id);

  const undoRecord = writeAudit({
    personId: event.entity_id,
    action: "undo",
    summary: `Undid: ${event.summary}`,
    actorId,
    before: current,
    after: restored,
    undoOf: event.id,
  });

  return { ok: true as const, person: restored, undoRecord, original: event };
}
