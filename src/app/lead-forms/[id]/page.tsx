import Link from "next/link";
import { notFound } from "next/navigation";
import { updateLeadFormAction } from "@/app/lead-form-actions";
import { AppShell } from "@/components/AppShell";
import { CopyBlock } from "@/components/CopyBlock";
import { LeadFormEditor } from "@/components/LeadFormEditor";
import { countIntakesForForm, getLeadForm, leadFormSnippets } from "@/lib/lead-forms";
import { requireLeadFormAdmin } from "@/lib/page-helpers";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default async function LeadFormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireLeadFormAdmin();
  const { id } = await params;
  const query = await searchParams;
  const form = getLeadForm(id);
  if (!form) notFound();
  const snippets = leadFormSnippets(await publicOrigin(), form.slug);
  const enquiries = countIntakesForForm(form.id);

  return (
    <AppShell user={user} current="/lead-forms">
      <p className="text-sm text-muted">
        <Link href="/lead-forms" className="underline-offset-2 hover:underline">
          Lead forms
        </Link>
      </p>
      <h1 className="serif mt-2 text-4xl text-sage-deep">{form.name}</h1>
      <p className="mt-2 text-muted">{enquiries} {enquiries === 1 ? "enquiry" : "enquiries"} from this form.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LeadFormEditor action={updateLeadFormAction} form={form} error={query.error} />
        <section className="space-y-4 rounded-3xl border border-line bg-paper p-6">
          <h2 className="serif text-2xl text-sage-deep">Distribution</h2>
          <p className="text-sm text-muted">
            Give marketing the hosted page, or place the script on a landing page so UTM parameters, gclid, fbclid, the referring page, and the landing URL are stored on the enquiry.
          </p>
          <CopyBlock label="Hosted page" value={snippets.hosted} />
          <p>
            <a href={snippets.hosted} className="text-sm underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              Open hosted form
            </a>
          </p>
          <CopyBlock label="Embed iframe" value={snippets.iframe} />
          <CopyBlock label="Embed script" value={snippets.script} />
        </section>
      </div>
    </AppShell>
  );
}
