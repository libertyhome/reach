import { updateChecklistAction } from "@/app/actions";
import { COMMERCIAL_CHECKLIST, type Person } from "@/lib/types";

export function ChecklistForm({ person }: { person: Person }) {
  return (
    <form action={updateChecklistAction} className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <input type="hidden" name="id" value={person.id} />
      <h2 className="serif text-2xl text-sage-deep">Admissions checklist</h2>
      <p className="text-sm text-muted">
        Account and clinical approval are gates, not clinical notes. Therapy, meds, Form 7 and SoR stay in Within.
        ARP is the person on the file. ARF is the form.
      </p>
      <p className="rounded-2xl bg-linen px-4 py-3 text-sm text-ink/90">
        <span className="font-medium">Who ticks what:</span> Accounts ticks deposit received and accounts approved
        (on full payment). Admissions ticks funding confirmed after Accounts approved, plus ARF signed once the
        Within ARF is done.
      </p>
      <ul className="space-y-3">
        {COMMERCIAL_CHECKLIST.map((item) => (
          <li key={item.key}>
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                name={item.key}
                value="1"
                defaultChecked={person[item.key] === 1}
                className="mt-1 h-5 w-5 accent-[var(--sage)]"
              />
              <span>
                <span className="block">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {item.roleHint} · {item.help}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="submit" className="min-h-12 rounded-full bg-sage px-5 text-paper">
        Save checklist
      </button>
    </form>
  );
}
