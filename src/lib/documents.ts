import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { newId } from "./passwords";
import type { DocumentKind, PersonDocument } from "./types";

function uploadsRoot() {
  if (process.env.REACH_UPLOADS_PATH) return process.env.REACH_UPLOADS_PATH;
  return path.join(process.cwd(), "data", "uploads");
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

export function listDocuments(personId: string): PersonDocument[] {
  return getDb()
    .prepare(`SELECT * FROM person_documents WHERE person_id = ? ORDER BY created_at DESC`)
    .all(personId) as PersonDocument[];
}

export function getDocument(id: string): PersonDocument | null {
  return (
    (getDb().prepare(`SELECT * FROM person_documents WHERE id = ?`).get(id) as PersonDocument | undefined) ??
    null
  );
}

export function documentAbsolutePath(doc: PersonDocument) {
  return path.join(uploadsRoot(), doc.person_id, doc.stored_name);
}

export function savePersonDocument(input: {
  personId: string;
  kind: DocumentKind;
  title: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  forWithin: boolean;
  uploadedBy: string;
}): PersonDocument {
  const id = newId("doc");
  const stored_name = `${id}-${safeFilename(input.filename)}`;
  const dir = path.join(uploadsRoot(), input.personId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, stored_name), input.bytes);

  const doc: PersonDocument = {
    id,
    person_id: input.personId,
    kind: input.kind,
    title: input.title || input.filename,
    filename: input.filename,
    stored_name,
    mime_type: input.mimeType || "application/octet-stream",
    size_bytes: input.bytes.length,
    for_within: input.forWithin ? 1 : 0,
    uploaded_by: input.uploadedBy,
    created_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO person_documents (
        id, person_id, kind, title, filename, stored_name, mime_type, size_bytes,
        for_within, uploaded_by, created_at
      ) VALUES (
        @id, @person_id, @kind, @title, @filename, @stored_name, @mime_type, @size_bytes,
        @for_within, @uploaded_by, @created_at
      )`,
    )
    .run(doc);

  return doc;
}

export function deletePersonDocument(id: string) {
  const doc = getDocument(id);
  if (!doc) return { ok: false as const, error: "Document not found." };
  const filePath = documentAbsolutePath(doc);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // keep DB row removal even if file is already gone
  }
  getDb().prepare(`DELETE FROM person_documents WHERE id = ?`).run(id);
  return { ok: true as const };
}

/** Metadata for Within handoff — files stay on Reach until Within consumes the links. */
export function withinDocumentManifest(personId: string) {
  return listDocuments(personId)
    .filter((doc) => doc.for_within === 1)
    .map((doc) => ({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      filename: doc.filename,
      reachPath: `/api/documents/${doc.id}`,
    }));
}
