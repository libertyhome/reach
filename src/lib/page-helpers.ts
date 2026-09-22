import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { seedIfEmpty } from "./seed";
import type { User } from "./types";

export async function requireStaff(): Promise<User> {
  seedIfEmpty();
  const user = await getCurrentUser();
  if (!user) {
    // Route handler clears the cookie — RSC cannot mutate cookies during render.
    redirect("/api/session/clear?next=/login");
  }
  return user;
}
