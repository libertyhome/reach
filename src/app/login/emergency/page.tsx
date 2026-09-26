import { notFound } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { breakglassAction } from "@/app/breakglass-actions";
import { breakglassConfigured } from "@/lib/breakglass";

export const dynamic = "force-dynamic";

export default async function EmergencyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!breakglassConfigured()) notFound();
  const params = await searchParams;
  const message =
    params.error === "rate"
      ? "Too many attempts. Wait 15 minutes and try again."
      : params.error === "invalid"
        ? "That emergency sign-in was not accepted."
        : "";
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <BrandMark variant="lockup" />
      <div className="mt-6 rounded-3xl bg-terracotta px-5 py-4 text-sm text-paper">
        Emergency sign-in. Use this only when Microsoft sign-in is down. The session lasts one hour and every attempt
        is audited.
      </div>
      <form action={breakglassAction} className="mt-6 space-y-4 rounded-3xl border border-line bg-paper p-6">
        <label className="block">
          <span className="text-sm font-medium">Emergency email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Emergency password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-linen px-3"
          />
        </label>
        {message ? <p className="text-sm text-terracotta">{message}</p> : null}
        <button type="submit" className="min-h-12 w-full rounded-full bg-sage text-paper">
          Enter Reach
        </button>
      </form>
    </div>
  );
}
