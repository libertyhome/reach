import { updateLeadSourceAction } from "@/app/actions";
import { LEAD_SOURCE_LABEL } from "@/lib/labels";
import { LEAD_SOURCES, type Person } from "@/lib/types";

export function LeadSourceForm({ person }: { person: Person }) {
  return (
    <form action={updateLeadSourceAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="id" value={person.id} />
      <h2 className="serif text-2xl text-sage-deep">Lead source</h2>
      <p className="text-sm text-muted">
        This is a label for how they found us. Changing it never moves the card or archives it.
      </p>
      <label className="block">
        <span className="text-sm font-medium">Source</span>
        <select name="lead_source" defaultValue={person.lead_source} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3">
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {LEAD_SOURCE_LABEL[source]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Note</span>
        <input name="lead_source_note" defaultValue={person.lead_source_note} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3" />
      </label>
      <button type="submit" className="min-h-12 rounded-full border border-line px-5">
        Save lead source
      </button>
    </form>
  );
}
