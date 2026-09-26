"use server";

import { redirect } from "next/navigation";
import { establishSession } from "@/lib/auth";
import { attemptBreakglass, breakglassConfigured } from "@/lib/breakglass";

export async function breakglassAction(formData: FormData) {
  if (!breakglassConfigured()) redirect("/login");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = attemptBreakglass({ email, password });
  if (!result.ok) {
    if (result.reason === "rate_limited") redirect("/login/emergency?error=rate");
    redirect("/login/emergency?error=invalid");
  }
  await establishSession(result.user, "breakglass");
  redirect("/enquiries");
}
