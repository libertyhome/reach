import Link from "next/link";
import { sendToWithinAction } from "@/app/actions";
import { canSendToWithin } from "@/lib/access";
import { admissionSummary, HOUSE_LABEL } from "@/lib/labels";
import { buildAwaitingAdmission, placementLabel, sentStatusLine } from "@/lib/within-send";
import type { Person, User } from "@/lib/types";

export function SendToWithin({
  person,
  user,
  confirm,
}: {
  person: Person;
  user: User;
  confirm: boolean;
}) {
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
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            {placementLabel(preview.house, preview.body.phase)} · {admissionSummary({ ...person, admission_kind: preview.body.admissionKind }) || "Treatment"}
          </p>
          {preview.missing.length > 0 ? (
            <p className="text-sm font-medium text-terracotta">Documents incomplete — review them before sending.</p>
          ) : (
            <p className="text-sm">Required documents are complete.</p>
          )}
          <Link
            href={`/people/${person.id}?confirm=within`}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-sage px-5 text-paper"
          >
            {sendLabel}
          </Link>
        </div>
      ) : null}

      {confirm && canOpen && preview?.ok ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-within-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl border border-line bg-paper p-6 shadow-xl"
          >
            <h3 id="send-within-title" className="serif text-2xl text-sage-deep">
              Send to Within?
            </h3>
            <p className="mt-2 text-sm text-muted">
              {HOUSE_LABEL[preview.house]} only. {placementLabel(preview.house, preview.body.phase)}. Sending again
              updates the same waiting record.
            </p>

            {preview.missing.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-terracotta/50 bg-sand px-4 py-3">
                <p className="font-medium text-terracotta">Documents incomplete</p>
                <p className="mt-1 text-sm">
                  These required documents are missing. Within will show the pack as incomplete. You can still send.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {preview.missing.map((item) => (
                    <li key={item.kind}>{item.label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-linen px-4 py-3 text-sm">Required documents are complete.</p>
            )}

            <form action={sendToWithinAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input type="hidden" name="id" value={person.id} />
              <button type="submit" className="min-h-12 flex-1 rounded-full bg-sage px-5 text-paper">
                {preview.missing.length > 0 ? "Send anyway" : "Send to Within"}
              </button>
              <Link
                href={`/people/${person.id}`}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-line px-5"
              >
                Cancel
              </Link>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
