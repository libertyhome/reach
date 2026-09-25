import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LeadFormEditor } from "@/components/LeadFormEditor";
import { createLeadFormAction } from "@/app/lead-form-actions";
import { requireLeadFormAdmin } from "@/lib/page-helpers";

export const dynamic = "force-dynamic";

export default async function NewLeadFormPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireLeadFormAdmin();
  const params = await searchParams;
  return (
    <AppShell user={user} current="/lead-forms">
      <p className="text-sm text-muted">
        <Link href="/lead-forms" className="underline-offset-2 hover:underline">
          Lead forms
        </Link>
      </p>
      <h1 className="serif mt-2 text-4xl text-sage-deep">New lead form</h1>
      <p className="mt-2 max-w-xl text-muted">
        Executive is the admin desk. Marketing then places the hosted link or the embed on each lead source.
      </p>
      <div className="mt-8">
        <LeadFormEditor action={createLeadFormAction} error={params.error} />
      </div>
    </AppShell>
  );
}
