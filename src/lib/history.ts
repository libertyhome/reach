import { getDb } from "./db";
import { listPeople } from "./people";
import type { Person } from "./types";

/**
 * Admitted history: anyone who reached Admit or Resident, now or earlier.
 *
 * A person counts when any of these is true:
 * - current stage is admit or resident
 * - admitted_at is set (confirmed into a house, including after discharge/archive)
 * - a non-undone audit event, other than an undo record, has after_json.stage
 *   of admit or resident
 *
 * Undone moves do not count. An enquiry that was pushed to Admit by mistake and
 * then undone stays off this list.
 *
 * Not admitted: the file was archived or closed (stage archived, or archived_at set)
 * and the admitted rule above is false. Open pipeline cards that were never admitted
 * stay on Enquiries, Next Steps, Approval, or Admit — they are not "not admitted".
 */
export type HistoryClass = "admitted" | "not_admitted" | "open";

export function classifyHistory(
  person: Pick<Person, "stage" | "admitted_at" | "archived_at">,
  auditReachedAdmission: boolean,
): HistoryClass {
  const admitted =
    person.stage === "admit" ||
    person.stage === "resident" ||
    person.admitted_at.trim() !== "" ||
    auditReachedAdmission;
  if (admitted) return "admitted";
  const closed = person.stage === "archived" || person.archived_at.trim() !== "";
  if (closed) return "not_admitted";
  return "open";
}

export function admissionAuditIds(): Set<string> {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT entity_id AS id
       FROM audit_events
       WHERE undone = 0
         AND action != 'undo'
         AND json_valid(after_json)
         AND json_extract(after_json, '$.stage') IN ('admit', 'resident')`,
    )
    .all() as { id: string }[];
  return new Set(rows.map((row) => row.id));
}

function byAdmittedDesc(a: Person, b: Person) {
  const aKey = a.admitted_at || a.admission_date || a.updated_at;
  const bKey = b.admitted_at || b.admission_date || b.updated_at;
  if (aKey !== bKey) return aKey < bKey ? 1 : -1;
  return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
}

function byClosedDesc(a: Person, b: Person) {
  const aKey = a.archived_at || a.updated_at;
  const bKey = b.archived_at || b.updated_at;
  if (aKey !== bKey) return aKey < bKey ? 1 : -1;
  return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
}

export function listAdmittedHistory(): Person[] {
  const reached = admissionAuditIds();
  return listPeople()
    .filter((person) => classifyHistory(person, reached.has(person.id)) === "admitted")
    .sort(byAdmittedDesc);
}

export function listNotAdmittedHistory(): Person[] {
  const reached = admissionAuditIds();
  return listPeople()
    .filter((person) => classifyHistory(person, reached.has(person.id)) === "not_admitted")
    .sort(byClosedDesc);
}

export function closedOn(person: Pick<Person, "archived_at" | "updated_at">) {
  return (person.archived_at || person.updated_at || "").slice(0, 10);
}
