import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { raiseSageInvoice } from "@/lib/finance";
import type { Currency } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";

/**
 * POST /api/sage/raise-invoice
 * Records a durable invoice request + pending Invoices row.
 * Does not write to the Sage ledger — Sage bot owns posting.
 * TODO: email accounts@ / Sage Bot to Action when ops mail is wired.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    personId?: string;
    amountHint?: number;
    currency?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const personId = String(body.personId ?? "").trim();
  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  const currencyRaw = String(body.currency ?? "").trim().toUpperCase();
  const currency = CURRENCIES.includes(currencyRaw as Currency) ? (currencyRaw as Currency) : undefined;

  const result = raiseSageInvoice({
    personId,
    amountHint: typeof body.amountHint === "number" ? body.amountHint : undefined,
    currency,
    notes: body.notes ? String(body.notes) : undefined,
    requestedBy: user,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    request: result.request,
    invoice: result.invoice,
    eventId: result.event.id,
    notify: result.notify,
    message:
      "Invoice request recorded. Pending row created on Invoices. Sage bot owns ledger posting — no Sage API write from Reach.",
  });
}
