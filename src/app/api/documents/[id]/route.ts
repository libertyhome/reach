import fs from "fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { contentDispositionFor, documentAbsolutePath, getDocument } from "@/lib/documents";
import { requestHasHandoffSecret } from "@/lib/handoff";

/**
 * Staff download with a Reach session.
 * Within opens the same URL with the handoff bearer (Authorization: Bearer, or
 * X-Reach-Handoff-Secret). Within should fetch this server-side and stream the
 * bytes. A browser navigation does not send that header, so the secret stays
 * off the query string.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const allowed = requestHasHandoffSecret(request) || Boolean(await getCurrentUser());
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const doc = getDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const filePath = documentAbsolutePath(doc);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  const bytes = fs.readFileSync(filePath);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": contentDispositionFor(doc.mime_type || "", doc.filename),
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
