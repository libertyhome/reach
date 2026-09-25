import { archiveAction, moveStageAction } from "@/app/actions";
import { NOT_CONVERTED_REASON_LABEL, PIPELINE_STAGES, STAGE_LABEL, notConvertedReasonLabel } from "@/lib/labels";
import { NOT_CONVERTED_REASONS, type Person } from "@/lib/types";

export function StageMove({ person }: { person: Person }) {
  if (person.stage === "resident") {
    return (
      <div className="rounded-3xl border border-line bg-paper p-6">
        <h2 className="serif text-2xl text-sage-deep">Stage</h2>
        <p className="mt-2 text-sm text-muted">
          This person is a resident. Clinical work lives in Within. Archive only if the commercial file should leave the house boards.
        </p>
        <form action={archiveAction} className="mt-4">
          <input type="hidden" name="id" value={person.id} />
          <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
            Archive
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <h2 className="serif text-2xl text-sage-deep">Move stage</h2>
      <p className="text-sm text-muted">
        Current: <strong>{STAGE_LABEL[person.stage]}</strong>. Moves are undoable. Admit onto a house is a separate confirm.
      </p>
      <div className="flex flex-wrap gap-2">
        {PIPELINE_STAGES.filter((stage) => stage !== person.stage).map((stage) => (
          <form action={moveStageAction} key={stage}>
            <input type="hidden" name="id" value={person.id} />
            <input type="hidden" name="stage" value={stage} />
            <button type="submit" className="min-h-11 rounded-full border border-line px-4 text-sm">
              {STAGE_LABEL[stage]}
            </button>
          </form>
        ))}
        {person.stage !== "archived" ? (
          <form action={archiveAction} className="basis-full space-y-3 border-t border-line pt-4">
            <input type="hidden" name="id" value={person.id} />
            <label className="block">
              <span className="text-sm font-medium">Reason for not converting</span>
              <select
                name="not_converted_reason"
                required
                defaultValue={person.not_converted_reason}
                className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
              >
                <option value="" disabled>
                  Choose a reason
                </option>
                {NOT_CONVERTED_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {NOT_CONVERTED_REASON_LABEL[reason]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-full border border-terracotta/40 px-4 text-sm text-terracotta">
              Archive
            </button>
          </form>
        ) : person.not_converted_reason ? (
          <p className="basis-full text-sm text-muted">
            Reason for not converting: {notConvertedReasonLabel(person.not_converted_reason)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
