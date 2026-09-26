"use server";

import { redirect } from "next/navigation";
import { canManageStaff } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createStaffUser, setStaffDisabled, unlinkMicrosoft, updateStaffRole } from "@/lib/users";

async function actor() {
  const user = await getCurrentUser();
  if (!user || !canManageStaff(user)) redirect("/enquiries");
  return user;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function addStaffAction(formData: FormData) {
  const user = await actor();
  const result = createStaffUser({
    name: text(formData, "name"),
    email: text(formData, "email"),
    role: text(formData, "role"),
    actorId: user.id,
  });
  if (!result.ok) redirect(`/staff?error=${encodeURIComponent(result.error)}`);
  redirect("/staff?notice=Staff member added. They sign in with Microsoft after their email matches.");
}

export async function updateStaffRoleAction(formData: FormData) {
  const user = await actor();
  const result = updateStaffRole({
    userId: text(formData, "userId"),
    role: text(formData, "role"),
    actorId: user.id,
  });
  if (!result.ok) redirect(`/staff?error=${encodeURIComponent(result.error)}`);
  redirect("/staff?notice=Role saved.");
}

export async function setStaffDisabledAction(formData: FormData) {
  const user = await actor();
  const result = setStaffDisabled({
    userId: text(formData, "userId"),
    disabled: text(formData, "disabled") === "1",
    actorId: user.id,
  });
  if (!result.ok) redirect(`/staff?error=${encodeURIComponent(result.error)}`);
  redirect("/staff?notice=Sign-in updated.");
}

export async function unlinkMicrosoftAction(formData: FormData) {
  const user = await actor();
  const result = unlinkMicrosoft({ userId: text(formData, "userId"), actorId: user.id });
  if (!result.ok) redirect(`/staff?error=${encodeURIComponent(result.error)}`);
  redirect("/staff?notice=Microsoft account unlinked.");
}
