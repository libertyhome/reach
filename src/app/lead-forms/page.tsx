import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { marketingSourceLabel } from "@/lib/marketing-sources";
import { countIntakesForForm, listLeadForms } from "@/lib/lead-forms";
import { requireLeadFormAdmin } from "@/lib/page-helpers";

export const dynamic = "force-dynamic";

export default async function LeadFormsPage() {
  const user = await requireLeadFormAdmin();
  const forms = listLeadForms();

  return (
    <AppShell user={user} current="/lead-forms">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="serif text-4xl text-sage-deep">Lead forms</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Create a named form for each ad, landing page, or partner. Every submission opens a New Enquiry with that source.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/lead-forms/report" className="min-h-12 rounded-full border border-line px-5 py-3">
            Source report
          </Link>
          <Link href="/lead-forms/new" className="min-h-12 rounded-full bg-sage px-5 py-3 text-paper">
            New form
          </Link>
        </div>
      </div>
      <div className="mt-8 grid gap-4">
        {forms.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-muted">
            No forms yet. Create one for Meta, Google, or a landing page.
          </p>
        ) : null}
        {forms.map((form) => (
          <Link key={form.id} href={`/lead-forms/${form.id}`} className="rounded-3xl border border-line bg-paper p-5 hover:border-sage">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="serif text-2xl text-sage-deep">{form.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {marketingSourceLabel(form.lead_source)}
                  {form.campaign ? ` · ${form.campaign}` : ""}
                  {form.active === 1 ? "" : " · paused"}
                </p>
              </div>
              <p className="text-sm text-muted">{countIntakesForForm(form.id)} enquiries</p>
            </div>
            <p className="mt-3 text-sm">/f/{form.slug}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
