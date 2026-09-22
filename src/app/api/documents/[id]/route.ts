import fs from "fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { documentAbsolutePath, getDocument } from "@/lib/documents";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
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
      "Content-Disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
