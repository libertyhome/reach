"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewCreditors } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createCreditor, deleteCreditor, getCreditor, pullAccounting, updateCreditor } from "@/lib/creditors";
import type { AccountingCompanyId } from "@/lib/accounting/connector";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function facilityOf(value: string): AccountingCompanyId | "" {
  return value === "manor" || value === "lodge" ? value : "";
}

async function requireCreditorActor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewCreditors(user)) redirect("/enquiries");
  return user;
}

function creditorInput(formData: FormData) {
  return {
    name: formString(formData, "name"),
    facility: facilityOf(formString(formData, "facility")),
    contactName: formString(formData, "contactName"),
    email: formString(formData, "email"),
    phone: formString(formData, "phone"),
    accountReference: formString(formData, "accountReference"),
    notes: formString(formData, "notes"),
  };
}

function syncNotice(name: string, verb: string, sync: { ok: boolean; message?: string }) {
  if (sync.ok) return `${verb} ${name}. Pushed to accounting.`;
  return `${verb} ${name} in Reach. ${sync.message ?? "Accounting push did not run."}`;
}

export async function createCreditorAction(formData: FormData) {
  const user = await requireCreditorActor();
  const result = createCreditor(creditorInput(formData), user.id);
  if (!result.ok) {
    redirect(`/creditors?notice=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/creditors");
  redirect(`/creditors?notice=${encodeURIComponent(syncNotice(result.creditor.name, "Saved", result.sync))}`);
}

export async function updateCreditorAction(formData: FormData) {
  const user = await requireCreditorActor();
  const id = formString(formData, "id");
  const result = updateCreditor(id, creditorInput(formData), user.id);
  if (!result.ok) {
    redirect(`/creditors?notice=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/creditors");
  redirect(`/creditors?notice=${encodeURIComponent(syncNotice(result.creditor.name, "Updated", result.sync))}`);
}

export async function deleteCreditorAction(formData: FormData) {
  const user = await requireCreditorActor();
  const id = formString(formData, "id");
  const existing = getCreditor(id);
  const result = deleteCreditor(id, user.id);
  if (!result.ok) {
    redirect(`/creditors?notice=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/creditors");
  const label = existing?.name || "Creditor";
  const message = result.sync.ok
    ? `Removed ${label} and pushed the delete.`
    : `Removed ${label} in Reach. ${result.sync.message}`;
  redirect(`/creditors?notice=${encodeURIComponent(message)}`);
}

export async function pullAccountingAction() {
  const user = await requireCreditorActor();
  const result = pullAccounting(user.id);
  revalidatePath("/creditors");
  redirect(`/creditors?notice=${encodeURIComponent(result.message)}`);
}
