import { sendToWithinAction } from "@/app/actions";
import { canSendToWithin } from "@/lib/access";
import { admissionSummary } from "@/lib/labels";
import { buildAwaitingAdmission, placementLabel, sentStatusLine } from "@/lib/within-send";
import type { Person, User } from "@/lib/types";

export function SendToWithin({ person, user }: { person: Person; user: User }) {
  const allowed = canSendToWithin(user);
  const status = sentStatusLine(person);
  const already = person.within_waiting_status === "already_admitted";
  const preview = allowed && !already ? buildAwaitingAdmission(person, user) : null;
  const canOpen = Boolean(preview?.ok);
  const sendLabel = person.within_waiting_status === "awaiting_admission" ? "Send update to Within" : "Send to Within";

  return (
    <section className="rounded-3xl border border-sage/40 bg-paper p-6">
      <h2 className="serif text-2xl text-sage-deep">Send to Within</h2>
      <p className="mt-2 text-sm text-muted">
        Parks this client on Within&apos;s waiting list. It does not admit them. Manor and Lodge stay on separate lists.
        Admission documents are completed in Within.
      </p>

      {status ? (
        <p
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            already ? "border border-terracotta/40 bg-sand text-terracotta" : "bg-linen text-ink"
          }`}
        >
          {status}
        </p>
      ) : null}

      {!allowed ? (
        <p className="mt-4 text-sm text-muted">Only admissions or admin can send a client to Within.</p>
      ) : null}

      {preview && !preview.ok ? (
        <p className="mt-4 rounded-2xl border border-terracotta/40 bg-sand px-4 py-3 text-sm text-terracotta">
          {preview.error}
        </p>
      ) : null}

      {canOpen && preview?.ok ? (
        <form action={sendToWithinAction} className="mt-4 space-y-3">
          <p className="text-sm">
            {placementLabel(preview.house, preview.body.phase)} ·{" "}
            {admissionSummary({ ...person, admission_kind: preview.body.admissionKind }) || "Treatment"}
          </p>
          <input type="hidden" name="id" value={person.id} />
          <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-full bg-sage px-5 text-paper">
            {sendLabel}
          </button>
        </form>
      ) : null}
    </section>
  );
}
