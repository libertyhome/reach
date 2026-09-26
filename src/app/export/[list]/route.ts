import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleListExport } from "@/lib/export-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ list: string }> }) {
  const user = await getCurrentUser();
  const { list } = await context.params;
  const result = await handleListExport(list, user, new URL(request.url).searchParams);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(new Uint8Array(result.body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
