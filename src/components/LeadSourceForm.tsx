import { updateLeadSourceAction } from "@/app/actions";
import { LeadSourceFields } from "@/components/LeadSourceFields";
import type { Person } from "@/lib/types";

export function LeadSourceForm({ person }: { person: Person }) {
  return (
    <form action={updateLeadSourceAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="id" value={person.id} />
      <h2 className="serif text-2xl text-sage-deep">Lead source</h2>
      <p className="text-sm text-muted">
        This is a label for how they found us. Changing it never moves the card or archives it. An older source stays
        selected until someone chooses a new one.
      </p>
      <LeadSourceFields
        leadSource={person.lead_source}
        leadSourceNote={person.lead_source_note}
        leadSourceWho={person.lead_source_who}
      />
      <button type="submit" className="min-h-12 rounded-full border border-line px-5">
        Save lead source
      </button>
    </form>
  );
}
