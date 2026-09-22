import { archiveAction, moveStageAction } from "@/app/actions";
import { PIPELINE_STAGES, STAGE_LABEL } from "@/lib/labels";
import type { Person } from "@/lib/types";

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
          <form action={archiveAction}>
            <input type="hidden" name="id" value={person.id} />
            <button type="submit" className="min-h-11 rounded-full border border-terracotta/40 px-4 text-sm text-terracotta">
              Archive
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
