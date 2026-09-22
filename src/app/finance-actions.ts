"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  raiseSageInvoice,
  undoFinanceEvent,
  updateAccountInvoiceStatus,
} from "@/lib/finance";
import type { InvoiceStatus } from "@/lib/finance-types";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safeAccountsNext(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/accounts";
  }
  return value;
}

export async function raiseSageInvoiceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const personId = formString(formData, "personId");
  const notes = formString(formData, "notes");
  const next = safeAccountsNext(formString(formData, "next") || "/accounts");
  const amountRaw = formString(formData, "amountHint");
  const amountHint = amountRaw ? Number(amountRaw) : undefined;
  const result = raiseSageInvoice({
    personId,
    notes,
    amountHint: Number.isFinite(amountHint) ? amountHint : undefined,
    requestedBy: user,
  });
  if (!result.ok) {
    redirect(`${next}?notice=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/accounts");
  revalidatePath("/invoices");
  redirect(
    `${next}?undo=${result.event.id}&notice=${encodeURIComponent(
      `Sage invoice request recorded for ${result.request.client_name} (${result.invoice.invoice_number}). Pending on Invoices — Sage bot posts the ledger.`,
    )}`,
  );
}

export async function batchRaiseSageInvoiceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const next = safeAccountsNext(formString(formData, "next") || "/accounts");
  const ids = formData.getAll("personIds").map((value) => String(value).trim()).filter(Boolean);
  if (ids.length === 0) {
    redirect(`${next}?notice=${encodeURIComponent("Select at least one client to raise invoices.")}`);
  }
  let lastEventId = "";
  let raised = 0;
  for (const personId of ids) {
    const result = raiseSageInvoice({ personId, requestedBy: user, notes: "Batch raise" });
    if (result.ok) {
      raised += 1;
      lastEventId = result.event.id;
    }
  }
  revalidatePath("/accounts");
  revalidatePath("/invoices");
  const notice = `Raised ${raised} Sage invoice request${raised === 1 ? "" : "s"}. Pending rows on Invoices.`;
  redirect(
    lastEventId
      ? `${next}?undo=${lastEventId}&notice=${encodeURIComponent(notice)}`
      : `${next}?notice=${encodeURIComponent(notice)}`,
  );
}

export async function accountRenewalAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const personId = formString(formData, "personId");
  const action = formString(formData, "renewalAction") as "remind" | "renewed" | "raise";
  const next = safeAccountsNext(formString(formData, "next") || "/accounts");

  if (action === "raise") {
    const result = raiseSageInvoice({
      personId,
      requestedBy: user,
      notes: "Raised from renewal strip",
    });
    if (!result.ok) redirect(`${next}?notice=${encodeURIComponent(result.error)}`);
    revalidatePath("/accounts");
    revalidatePath("/invoices");
    redirect(
      `${next}?undo=${result.event.id}&notice=${encodeURIComponent(
        `Raise Sage invoice queued for ${result.request.client_name}.`,
      )}`,
    );
  }

  const statusMap: Record<"remind" | "renewed", InvoiceStatus> = {
    remind: "sent",
    renewed: "renewed",
  };
  const status = statusMap[action];
  if (!status) {
    redirect(`${next}?notice=${encodeURIComponent("Unknown renewal action")}`);
  }
  const label = action === "remind" ? "Reminded — invoice status set to sent" : "Marked renewed (+28 days)";
  const result = updateAccountInvoiceStatus(personId, status, user, label);
  if (!result.ok) redirect(`${next}?notice=${encodeURIComponent(result.error)}`);
  revalidatePath("/accounts");
  redirect(`${next}?undo=${result.event.id}&notice=${encodeURIComponent(label)}`);
}

export async function undoFinanceAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const eventId = formString(formData, "eventId");
  const next = safeAccountsNext(formString(formData, "next") || "/accounts");
  const result = undoFinanceEvent(eventId, user.id);
  revalidatePath("/accounts");
  revalidatePath("/invoices");
  if (!result.ok) {
    redirect(`${next}?notice=${encodeURIComponent(result.error)}`);
  }
  redirect(`${next}?notice=${encodeURIComponent("Undone.")}`);
}
