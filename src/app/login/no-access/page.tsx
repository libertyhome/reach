import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

const COPY: Record<string, string> = {
  unknown: "You're signed in to Microsoft, but you don't have access to Reach yet. Ask the executive desk.",
  disabled: "This Reach account is disabled. Ask the executive desk.",
  conflict: "This Microsoft account doesn't match the Reach staff record. Ask the executive desk.",
  mfa: "Microsoft did not confirm multifactor authentication. Sign in again with MFA, or ask the executive desk.",
  verify: "Microsoft sign-in could not be verified. Try again.",
};

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const message = COPY[params.reason || ""] || COPY.unknown;
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <BrandMark variant="lockup" />
      <h1 className="serif mt-6 text-3xl text-sage-deep">No access to Reach yet</h1>
      <p className="mt-3 text-ink/90">{message}</p>
      <Link href="/login" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-sage px-5 text-paper">
        Back to sign in
      </Link>
    </div>
  );
}
