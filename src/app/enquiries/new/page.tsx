import { AppShell } from "@/components/AppShell";
import { NewEnquiryForm } from "@/components/NewEnquiryForm";
import { requireStaff } from "@/lib/page-helpers";
import { listUsers } from "@/lib/users";

export default async function NewEnquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireStaff();
  const params = await searchParams;
  const staff = listUsers();
  return (
    <AppShell user={user} current="/enquiries">
      <h1 className="serif text-4xl text-sage-deep">New enquiry</h1>
      <p className="mt-2 max-w-xl text-muted">
        Record the caller and the resident separately when they are not the same person. This stays on Enquiries until
        someone moves it.
      </p>
      {params.error ? (
        <p className="mt-4 max-w-xl rounded-2xl border border-terracotta/40 bg-paper px-4 py-3 text-sm text-terracotta">
          {params.error}
        </p>
      ) : null}
      <NewEnquiryForm staff={staff} currentUserId={user.id} />
    </AppShell>
  );
}
