import Link from "next/link";
import { HOUSE_SHORT, STAGE_LABEL, leadSourceLabel, personDisplayName } from "@/lib/labels";
import { getRoom } from "@/lib/rooms";
import {
  CONTACT_METHOD_LABEL,
  type ContactMethod,
  type Person,
} from "@/lib/types";
import { findUserById } from "@/lib/users";

export function PersonCard({ person, highlight }: { person: Person; highlight?: boolean }) {
  const room = person.room_id ? getRoom(person.room_id) : null;
  const assignee = person.assigned_to_user_id ? findUserById(person.assigned_to_user_id) : null;
  const contact =
    person.contact_method && person.contact_method in CONTACT_METHOD_LABEL
      ? CONTACT_METHOD_LABEL[person.contact_method as ContactMethod]
      : "";
  return (
    <Link
      href={`/people/${person.id}`}
      className={`block rounded-3xl border bg-paper p-5 transition hover:border-sage ${
        highlight ? "border-sage shadow-[0_0_0_1px_var(--sage)]" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="serif text-2xl text-sage-deep">{personDisplayName(person)}</p>
          <p className="mt-1 text-sm text-muted">
            {leadSourceLabel(person.lead_source)}
            {contact ? ` · ${contact}` : ""}
            {person.phone ? ` · ${person.phone}` : ""}
            {assignee ? ` · ${assignee.name.split(/\s+/)[0]}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-wider">
          {person.stage === "resident" && person.house
            ? `${HOUSE_SHORT[person.house]}${room ? ` · ${room.name}` : ""}`
            : STAGE_LABEL[person.stage]}
        </span>
      </div>
      {person.caller_name || person.resident_name ? (
        <p className="mt-2 text-sm text-muted">
          {person.caller_name ? `Caller ${person.caller_name}` : ""}
          {person.caller_name && person.resident_name ? " · " : ""}
          {person.resident_name ? `Resident ${person.resident_name}` : ""}
        </p>
      ) : null}
      {person.next_of_kin_name || person.arp_email ? (
        <p className="mt-2 text-sm">
          ARP
          {person.next_of_kin_name ? ` · ${person.next_of_kin_name}` : ""}
          {person.arp_email ? ` · ${person.arp_email}` : ""}
        </p>
      ) : null}
      {person.commercial_notes ? (
        <p className="mt-3 line-clamp-2 text-sm">{person.commercial_notes}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">No notes yet.</p>
      )}
      {person.expected_arrival ? (
        <p className="mt-2 text-xs uppercase tracking-wider text-muted">Arrival {person.expected_arrival}</p>
      ) : null}
      {person.within_waiting_status === "awaiting_admission" ? (
        <p className="mt-2 text-xs uppercase tracking-wider text-sage-deep">Awaiting admission in Within</p>
      ) : null}
      {person.within_waiting_status === "already_admitted" ? (
        <p className="mt-2 text-xs uppercase tracking-wider text-terracotta">Already admitted in Within</p>
      ) : null}
    </Link>
  );
}
