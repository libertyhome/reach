"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLeadForms } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { getLeadForm, saveLeadForm } from "@/lib/lead-forms";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageLeadForms(user)) redirect("/enquiries");
  return user;
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createLeadFormAction(formData: FormData) {
  await requireAdmin();
  const saved = saveLeadForm({
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    leadSource: formString(formData, "lead_source"),
    campaign: formString(formData, "campaign"),
    allowedDomains: formString(formData, "allowed_domains"),
    externalKey: formString(formData, "external_key"),
    privacyUrl: formString(formData, "privacy_url") || "/privacy",
    active: formData.get("active") === "1",
  });
  if (!saved.ok) fail("/lead-forms/new", saved.error);
  revalidatePath("/lead-forms");
  redirect(`/lead-forms/${saved.form.id}`);
}

export async function updateLeadFormAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const existing = getLeadForm(id);
  if (!existing) fail("/lead-forms", "That form no longer exists.");
  const saved = saveLeadForm(
    {
      name: formString(formData, "name"),
      slug: formString(formData, "slug"),
      leadSource: formString(formData, "lead_source"),
      campaign: formString(formData, "campaign"),
      allowedDomains: formString(formData, "allowed_domains"),
      externalKey: formString(formData, "external_key"),
      privacyUrl: formString(formData, "privacy_url") || "/privacy",
      active: formData.get("active") === "1",
    },
    id,
  );
  if (!saved.ok) fail(`/lead-forms/${id}`, saved.error);
  revalidatePath("/lead-forms");
  revalidatePath(`/lead-forms/${id}`);
  revalidatePath(`/f/${existing.slug}`);
  revalidatePath(`/f/${saved.form.slug}`);
  redirect(`/lead-forms/${id}`);
}
