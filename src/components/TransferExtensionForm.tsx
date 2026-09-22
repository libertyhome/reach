import { updateTransferExtensionAction } from "@/app/actions";
import { TRANSFER_EXTENSION_LABEL, TRANSFER_EXTENSION_STATUSES, type Person } from "@/lib/types";

export function TransferExtensionForm({ person }: { person: Person }) {
  return (
    <form
      action={updateTransferExtensionAction}
      className="space-y-4 rounded-3xl border border-line bg-paper p-6"
    >
      <input type="hidden" name="id" value={person.id} />
      <h2 className="serif text-2xl text-sage-deep">Transfers &amp; extensions</h2>
      <p className="text-sm text-muted">
        First-pass home for transfer and extension requests on this commercial card. Full workflow can grow here
        later — staff should look on this person/admit card, not on monday.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Status</span>
        <select
          name="transfer_extension_status"
          defaultValue={person.transfer_extension_status || "none"}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
        >
          {TRANSFER_EXTENSION_STATUSES.filter((value) => value !== "").map((value) => (
            <option key={value} value={value}>
              {TRANSFER_EXTENSION_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          name="transfer_extension_notes"
          rows={3}
          defaultValue={person.transfer_extension_notes}
          placeholder="e.g. Manor → Lodge transfer asked for week 3; or 7-day extension pending accounts."
          className="mt-1 w-full rounded-xl border border-line bg-linen px-3 py-2"
        />
      </label>
      <button type="submit" className="min-h-12 rounded-full border border-line px-5">
        Save transfers &amp; extensions
      </button>
    </form>
  );
}
