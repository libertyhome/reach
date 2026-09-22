import { AppShell } from "@/components/AppShell";
import { NewEnquiryForm } from "@/components/NewEnquiryForm";
import { requireStaff } from "@/lib/page-helpers";
import { listUsers } from "@/lib/users";

export default async function NewEnquiryPage() {
  const user = await requireStaff();
  const staff = listUsers();
  return (
    <AppShell user={user} current="/enquiries">
      <h1 className="serif text-4xl text-sage-deep">New enquiry</h1>
      <p className="mt-2 max-w-xl text-muted">
        Name and a way to call back is enough. Everything else can wait. This stays on Enquiries until someone moves it.
      </p>
      <NewEnquiryForm staff={staff} currentUserId={user.id} />
    </AppShell>
  );
}
