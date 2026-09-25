import { PublicLeadForm } from "@/components/PublicLeadForm";
import { attributionFromSearch, getActiveLeadFormBySlug } from "@/lib/lead-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = getActiveLeadFormBySlug(slug);
  return {
    title: form ? `${form.name} — Liberty Home` : "Enquiry — Liberty Home",
    robots: { index: false, follow: false },
  };
}

export default async function HostedLeadFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const form = getActiveLeadFormBySlug(slug);
  if (!form) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm uppercase tracking-[0.18em] text-sage">Liberty Home</p>
        <h1 className="serif mt-2 text-4xl text-sage-deep">This form is not available</h1>
        <p className="mt-3 text-muted">The link may be old, or the form has been paused.</p>
      </main>
    );
  }
  const query = await searchParams;
  const paramsUrl = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") paramsUrl.set(key, value);
  }
  return (
    <main>
      <PublicLeadForm form={form} defaults={attributionFromSearch(paramsUrl)} error={paramsUrl.get("error") ?? ""} />
    </main>
  );
}
