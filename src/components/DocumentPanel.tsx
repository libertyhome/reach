import { deleteDocumentAction, uploadDocumentAction } from "@/app/actions";
import { DOCUMENT_KIND_LABEL, DOCUMENT_KINDS, type PersonDocument } from "@/lib/types";
import { findUserById } from "@/lib/users";

export function DocumentPanel({ personId, documents }: { personId: string; documents: PersonDocument[] }) {
  return (
    <section className="space-y-4 rounded-3xl border border-line bg-paper p-6">
      <h2 className="serif text-2xl text-sage-deep">Documents for Within</h2>
      <p className="text-sm text-muted">
        Store discharge / clinical reports on Reach. Tick <span className="font-medium text-ink">For Within</span> so
        handoff metadata includes a Reach download link. Clinical signing still happens in Within — Reach does not call
        a Within upload API unless configured separately.
      </p>

      <form action={uploadDocumentAction} className="space-y-3 rounded-2xl border border-dashed border-line bg-linen p-4">
        <input type="hidden" name="id" value={personId} />
        <label className="block">
          <span className="text-sm font-medium">Document type</span>
          <select name="kind" defaultValue="clinical_report" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3">
            {DOCUMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DOCUMENT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input name="title" placeholder="Optional title" className="mt-1 min-h-12 w-full rounded-xl border border-line bg-paper px-3" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">File</span>
          <input name="file" type="file" required className="mt-1 block w-full text-sm" />
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input type="checkbox" name="for_within" value="1" defaultChecked className="h-5 w-5 accent-[var(--sage)]" />
          <span>For Within (include in admit handoff metadata)</span>
        </label>
        <button type="submit" className="min-h-12 rounded-full bg-sage px-5 text-paper">
          Upload document
        </button>
      </form>

      {documents.length === 0 ? (
        <p className="text-sm text-muted">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => {
            const uploader = doc.uploaded_by ? findUserById(doc.uploaded_by) : null;
            return (
              <li key={doc.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-linen px-4 py-3">
                <div>
                  <p className="font-medium">{doc.title || doc.filename}</p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-muted">
                    {DOCUMENT_KIND_LABEL[doc.kind]} · {doc.for_within ? "For Within" : "Reach only"}
                    {uploader ? ` · ${uploader.name.split(/\s+/)[0]}` : ""}
                  </p>
                  <a href={`/api/documents/${doc.id}`} className="mt-2 inline-block text-sm text-sage-deep underline-offset-2 hover:underline">
                    Download {doc.filename}
                  </a>
                </div>
                <form action={deleteDocumentAction}>
                  <input type="hidden" name="id" value={personId} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <button type="submit" className="min-h-10 rounded-full border border-line px-3 text-xs">
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
